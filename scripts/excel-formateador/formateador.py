#!/usr/bin/env python3
"""
Genera el archivo censo-{año}.xlsx llenando las 3 pestañas del template
ministerial con los datos de la DB.

Flujo: el backend consulta la DB (fuente de verdad), serializa los datos como JSON,
y este script usa zipfile + ElementTree para abrir UNA copia del template y
llenar las 3 pestañas a nivel XML, preservando TODA la fidelidad del template:
- Imágenes/dibujos (drawing relationships)
- Celdas combinadas (merged cells)
- Fórmulas
- Estilos en filas preparadas en blanco
- Dimensiones de filas/columnas
- Filtros y definiciones de tabla (expandiendo refs si hay más datos)
- Nombres de hojas

Uso:
    python scripts/excel-formateador/formateador.py \
        --data <datos.json> \
        --output <censo-2026.xlsx>

JSON de entrada (lo produce el backend desde Prisma):
{
  "censo": [{"VIGENCIA": 2026, "RESGUARDO INDIGENA": "0", ...}, ...],
  "altas": [...],
  "bajas": [...]
}
Las claves de cada fila son los nombres EXACTOS de las columnas del template.

Requiere: pip install -r scripts/excel-formateador/requirements.txt
"""

import argparse
import copy
import json
import os
import shutil
import sys
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from xml.etree import ElementTree as ET

# Register namespaces for pretty output
ET.register_namespace("", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
ET.register_namespace("r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
ET.register_namespace("mc", "http://schemas.openxmlformats.org/markup-compatibility/2006")
ET.register_namespace("x14", "http://schemas.microsoft.com/office/spreadsheetml/2009/9/main")
ET.register_namespace("x15", "http://schemas.microsoft.com/office/spreadsheetml/2010/11/main")

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

TEMPLATE = "templates/Formato Censal.xlsx"

# Sheet configuration: name -> {header_row, data_start_row, data_key, table_name, max_prepared_rows}
TABS = {
    "FORMATO_CENSOS": {
        "header_row": 6,
        "data_start": 7,
        "data_key": "censo",
        "table_name": None,
        "max_prepared_rows": 1000,
        "sheet_id": 1,
    },
    "REPORTE ALTAS": {
        "header_row": 1,
        "data_start": 2,
        "data_key": "altas",
        "table_name": "Table_1",
        "max_prepared_rows": 24,  # rows 2-24 (23 data rows + 1 header)
        "sheet_id": 2,
    },
    "REPORTE BAJAS": {
        "header_row": 1,
        "data_start": 2,
        "data_key": "bajas",
        "table_name": "Table_2",
        "max_prepared_rows": 24,
        "sheet_id": 3,
    },
}

# Column letter to index mapping
def col_idx_to_letter(idx: int) -> str:
    """Convert 1-based column index to Excel letter (A=1, Z=26, AA=27, etc.)"""
    result = ""
    while idx > 0:
        idx, remainder = divmod(idx - 1, 26)
        result = chr(65 + remainder) + result
    return result


def col_letter_to_idx(letter: str) -> int:
    """Convert Excel column letter to 1-based index."""
    result = 0
    for ch in letter:
        result = result * 26 + (ord(ch.upper()) - 64)
    return result


def parse_cell_ref(ref: str) -> tuple[int, int]:
    """Parse Excel cell reference like 'A1' or '$A$1' -> (1, 1)"""
    # Remove $ signs for absolute references
    ref = ref.replace("$", "")
    col_str = ""
    row_str = ""
    for ch in ref:
        if ch.isalpha():
            col_str += ch
        else:
            row_str += ch
    return (col_letter_to_idx(col_str), int(row_str))


def parse_range_ref(ref: str) -> tuple[int, int, int, int]:
    """Parse Excel range reference like 'A1:O24' -> (1, 1, 15, 24)"""
    if ":" not in ref:
        c, r = parse_cell_ref(ref)
        return (c, r, c, r)
    start, end = ref.split(":")
    sc, sr = parse_cell_ref(start)
    ec, er = parse_cell_ref(end)
    return (sc, sr, ec, er)


def build_range_ref(start_col: int, start_row: int, end_col: int, end_row: int) -> str:
    """Build Excel range reference from indices."""
    return f"{col_idx_to_letter(start_col)}{start_row}:{col_idx_to_letter(end_col)}{end_row}"


class TemplateFiller:
    """Fills template XLSX at XML level preserving all fidelity."""

    def __init__(self, template_path: Path, data: dict):
        self.template_path = template_path
        self.data = data
        self.zip_data: dict[str, bytes] = {}
        self.shared_strings: list[str] = []
        self.string_to_idx: dict[str, int] = {}
        self.sheet_col_maps: dict[str, dict[str, int]] = {}

    def load_template(self):
        """Load template zip into memory."""
        with zipfile.ZipFile(self.template_path, "r") as z:
            for name in z.namelist():
                self.zip_data[name] = z.read(name)

    def save_output(self, output_path: Path):
        """Save modified zip to output."""
        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as z:
            for name, content in self.zip_data.items():
                z.writestr(name, content)

    def parse_shared_strings(self):
        """Parse sharedStrings.xml into a list and reverse index."""
        content = self.zip_data.get("xl/sharedStrings.xml", b"")
        if not content:
            self.shared_strings = []
            self.string_to_idx = {}
            return
        root = ET.fromstring(content)
        ns = NS["main"]
        self.shared_strings = []
        for si in root.findall(f".//{{{ns}}}si"):
            t_elem = si.find(f".//{{{ns}}}t")
            if t_elem is not None and t_elem.text is not None:
                self.shared_strings.append(t_elem.text)
            else:
                # Handle rich text (multiple t elements)
                texts = [t.text for t in si.findall(f".//{{{ns}}}t") if t.text]
                self.shared_strings.append("".join(texts))
        self.string_to_idx = {s: i for i, s in enumerate(self.shared_strings)}

    def get_string_idx(self, value: str) -> int:
        """Get shared string index, adding if new."""
        if value in self.string_to_idx:
            return self.string_to_idx[value]
        idx = len(self.shared_strings)
        self.shared_strings.append(value)
        self.string_to_idx[value] = idx
        return idx

    def save_shared_strings(self):
        """Write updated sharedStrings.xml and update content types."""
        ns = NS["main"]
        root = ET.Element(f"{{{ns}}}sst", {
            "count": str(sum(1 for _ in self.shared_strings)),  # total count
            "uniqueCount": str(len(self.shared_strings)),
        })
        for s in self.shared_strings:
            si = ET.SubElement(root, f"{{{ns}}}si")
            t = ET.SubElement(si, f"{{{ns}}}t")
            t.text = s
        # Use minimal pretty printing
        ET.indent(root, space="")
        xml_bytes = ET.tostring(root, encoding="utf-8", xml_declaration=True)
        self.zip_data["xl/sharedStrings.xml"] = xml_bytes

        # Update [Content_Types].xml to include sharedStrings override
        self.ensure_content_type_override("xl/sharedStrings.xml",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml")

    def ensure_content_type_override(self, part_name: str, content_type: str):
        """Ensure [Content_Types].xml has an override for the given part."""
        ct_name = "[Content_Types].xml"
        ct_content = self.zip_data.get(ct_name, b"")
        if not ct_content:
            return
        ct_root = ET.fromstring(ct_content)
        ct_ns = "http://schemas.openxmlformats.org/package/2006/content-types"

        # Check if override already exists
        part_path = f"/{part_name}"
        for override in ct_root.findall(f".//{{{ct_ns}}}Override"):
            if override.get("PartName") == part_path:
                # Already exists, update content type if needed
                override.set("ContentType", content_type)
                break
        else:
            # Add new override
            override = ET.SubElement(ct_root, f"{{{ct_ns}}}Override")
            override.set("PartName", part_path)
            override.set("ContentType", content_type)

        ET.indent(ct_root, space="")
        self.zip_data[ct_name] = ET.tostring(ct_root, encoding="utf-8", xml_declaration=True)

    def normalize_header(self, header: str) -> str:
        """Normalize header for matching: strip numeric prefixes, uppercase, remove spaces."""
        import re
        # Remove leading numeric prefix like "1. ", "2. ", etc.
        header = re.sub(r"^\d+\.\s*", "", header)
        return header.strip().upper().replace(" ", "")

    def parse_sheet_headers(self, sheet_name: str, sheet_xml: bytes) -> dict[str, int]:
        """Parse header row to build column name -> column index mapping."""
        root = ET.fromstring(sheet_xml)
        ns = NS["main"]
        tab = TABS[sheet_name]
        header_row = tab["header_row"]
        col_map = {}

        for row in root.findall(f".//{{{ns}}}row"):
            row_num = int(row.get("r", "0"))
            if row_num != header_row:
                continue
            for cell in row.findall(f".//{{{ns}}}c"):
                ref = cell.get("r", "")
                if not ref:
                    continue
                col_idx, _ = parse_cell_ref(ref)
                # Get cell value (might be shared string, inline string, or direct value)
                value = None
                cell_type = cell.get("t")
                if cell_type == "s":
                    # Shared string
                    v_elem = cell.find(f".//{{{ns}}}v")
                    if v_elem is not None and v_elem.text:
                        try:
                            sst_idx = int(v_elem.text)
                            if 0 <= sst_idx < len(self.shared_strings):
                                value = self.shared_strings[sst_idx]
                        except ValueError:
                            pass
                elif cell_type == "inlineStr":
                    # Inline string (openpyxl format)
                    is_elem = cell.find(f".//{{{ns}}}is")
                    if is_elem is not None:
                        t_elem = is_elem.find(f".//{{{ns}}}t")
                        if t_elem is not None and t_elem.text:
                            value = t_elem.text
                elif cell_type == "str":
                    # String stored directly in v
                    v_elem = cell.find(f".//{{{ns}}}v")
                    if v_elem is not None and v_elem.text:
                        value = v_elem.text
                else:
                    # Numeric or other - check v element
                    v_elem = cell.find(f".//{{{ns}}}v")
                    if v_elem is not None and v_elem.text:
                        value = v_elem.text

                if value is not None:
                    key = self.normalize_header(str(value))
                    col_map[key] = col_idx
        return col_map

    def build_col_maps(self):
        """Build column maps for all sheets from template headers."""
        for sheet_name, tab in TABS.items():
            sheet_file = f"xl/worksheets/sheet{tab['sheet_id']}.xml"
            sheet_xml = self.zip_data.get(sheet_file, b"")
            if sheet_xml:
                self.sheet_col_maps[sheet_name] = self.parse_sheet_headers(sheet_name, sheet_xml)
                print(f"  Column map for {sheet_name}: {len(self.sheet_col_maps[sheet_name])} columns")

    def update_sheet_data(self, sheet_name: str):
        """Update cell values in a sheet's data area."""
        tab = TABS[sheet_name]
        data_key = tab["data_key"]
        rows = self.data.get(data_key, [])

        col_map = self.sheet_col_maps.get(sheet_name, {})
        if not col_map:
            print(f"  {sheet_name}: no column map, skipping")
            return

        sheet_file = f"xl/worksheets/sheet{tab['sheet_id']}.xml"
        sheet_xml = self.zip_data.get(sheet_file, b"")
        root = ET.fromstring(sheet_xml)
        ns = NS["main"]

        data_start = tab["data_start"]
        max_prepared = tab["max_prepared_rows"]
        data_end = data_start + len(rows) - 1 if rows else data_start - 1

        # Find the last prepared row element (for cloning styles when exceeding capacity)
        last_prepared_row_elem = None
        sheet_data_elem = root.find(f".//{{{ns}}}sheetData")
        if sheet_data_elem is not None:
            for row in sheet_data_elem.findall(f".//{{{ns}}}row"):
                row_num = int(row.get("r", "0"))
                if row_num == max_prepared:
                    last_prepared_row_elem = row
                    break

        # Handle empty dataset: clear values in data area while preserving structure
        if not rows:
            print(f"  {sheet_name}: no data rows - clearing data area")
            self.clear_data_area_values(root, ns, data_start, max_prepared, col_map)
        else:
            # For each data row, update cells
            for r_idx, row_data in enumerate(rows):
                target_row = data_start + r_idx

                if target_row <= max_prepared:
                    # Within prepared rows - find existing row
                    row_elem = None
                    for row in root.findall(f".//{{{ns}}}row"):
                        if int(row.get("r", "0")) == target_row:
                            row_elem = row
                            break
                else:
                    # Beyond prepared rows - clone last prepared row
                    row_elem = self.clone_row_for_target(last_prepared_row_elem, target_row, ns)
                    if row_elem is not None and sheet_data_elem is not None:
                        # Remove any existing row with the same target row number
                        existing_rows = list(sheet_data_elem.findall(f".//{{{ns}}}row"))
                        for existing in existing_rows:
                            if int(existing.get("r", "0")) == target_row:
                                sheet_data_elem.remove(existing)
                                break
                        # Insert in correct position
                        inserted = False
                        for i, existing in enumerate(list(sheet_data_elem)):
                            if int(existing.get("r", "0")) > target_row:
                                sheet_data_elem.insert(i, row_elem)
                                inserted = True
                                break
                        if not inserted:
                            sheet_data_elem.append(row_elem)

                if row_elem is not None:
                    # Update cells in this row
                    self.update_row_cells(row_elem, target_row, row_data, col_map, ns)

        # Update autoFilter ref if present (for any sheet)
        self.update_auto_filter_ref(root, ns, tab["header_row"], data_end)

        # Save updated sheet XML
        ET.indent(root, space="")
        self.zip_data[sheet_file] = ET.tostring(root, encoding="utf-8", xml_declaration=True)

        # Update table ref if needed
        if tab["table_name"]:
            self.update_table_ref(tab["sheet_id"], tab["table_name"], data_start, len(rows))

    def clear_data_area_values(self, root: ET.Element, ns: str, data_start: int, max_prepared: int, col_map: dict[str, int]):
        """Clear value nodes (v/is) in the data area while preserving styles, formulas, and structure."""
        # Get column indices from col_map
        col_indices = set(col_map.values())

        for row in root.findall(f".//{{{ns}}}row"):
            row_num = int(row.get("r", "0"))
            if data_start <= row_num <= max_prepared:
                for cell in row.findall(f".//{{{ns}}}c"):
                    ref = cell.get("r", "")
                    if not ref:
                        continue
                    col_idx, _ = parse_cell_ref(ref)
                    if col_idx in col_indices:
                        # Remove value elements (v, is) but keep formula (f) and style
                        for child in list(cell):
                            if child.tag.endswith("}v") or child.tag.endswith("}is"):
                                cell.remove(child)
                        # Remove 't' attribute if it was for shared string
                        if cell.get("t") == "s":
                            del cell.attrib["t"]

    def clone_row_for_target(self, source_row: ET.Element | None, target_row: int, ns: str) -> ET.Element | None:
        """Clone the last prepared row XML including row attributes and styled cells,
        rewriting row/cell references to the target row."""
        if source_row is None:
            # Fallback: create basic row
            return ET.Element(f"{{{ns}}}row", {"r": str(target_row)})

        # Deep copy the row element
        import copy
        new_row = copy.deepcopy(source_row)
        new_row.set("r", str(target_row))

        # Update cell references in the cloned row
        for cell in new_row.findall(f".//{{{ns}}}c"):
            old_ref = cell.get("r", "")
            if old_ref:
                col_idx, _ = parse_cell_ref(old_ref)
                new_ref = f"{col_idx_to_letter(col_idx)}{target_row}"
                cell.set("r", new_ref)
                # Clear cell values but keep style (s attribute)
                for child in list(cell):
                    if child.tag.endswith("}v") or child.tag.endswith("}is"):
                        cell.remove(child)
                if cell.get("t") == "s":
                    del cell.attrib["t"]

        return new_row

    def update_row_cells(self, row_elem: ET.Element, target_row: int, row_data: dict, col_map: dict[str, int], ns: str):
        """Update cell values in a row, overwriting only mapped data-cell values."""
        for key, value in row_data.items():
            norm_key = self.normalize_header(str(key))
            # VIGENCIA reflects the year the file is generated, not the stored value.
            if norm_key == "VIGENCIA":
                value = datetime.now().year
            col_idx = col_map.get(norm_key)
            if col_idx is None:
                continue

            cell_ref = f"{col_idx_to_letter(col_idx)}{target_row}"
            # Find existing cell
            cell_elem = None
            for cell in row_elem.findall(f".//{{{ns}}}c"):
                if cell.get("r") == cell_ref:
                    cell_elem = cell
                    break

            if cell_elem is None:
                # Create new cell (shouldn't happen if cloned from prepared row)
                cell_elem = ET.Element(f"{{{ns}}}c", {"r": cell_ref})
                row_elem.append(cell_elem)

            # Set value - remove existing value elements but keep formula
            for child in list(cell_elem):
                if child.tag.endswith("}v") or child.tag.endswith("}is"):
                    cell_elem.remove(child)

            if value is None or value == "":
                # Blank cell - remove value, keep style
                if "t" in cell_elem.attrib:
                    del cell_elem.attrib["t"]
            elif isinstance(value, (int, float)):
                v = ET.SubElement(cell_elem, f"{{{ns}}}v")
                v.text = str(value)
            else:
                # String - use shared strings
                sst_idx = self.get_string_idx(str(value))
                cell_elem.set("t", "s")
                v = ET.SubElement(cell_elem, f"{{{ns}}}v")
                v.text = str(sst_idx)

    def update_auto_filter_ref(self, root: ET.Element, ns: str, header_row: int, data_end_row: int):
        """Expand autoFilter ref to cover header row plus all data rows."""
        auto_filter = root.find(f".//{{{ns}}}autoFilter")
        if auto_filter is not None:
            current_ref = auto_filter.get("ref", "")
            if current_ref:
                # Preserve $ signs from original ref
                has_dollar = "$" in current_ref
                sc, sr, ec, er = parse_range_ref(current_ref)
                # Keep start row (sr) and columns, expand end row to cover all data
                new_end_row = max(er, data_end_row)
                if new_end_row > er:
                    new_ref = build_range_ref(sc, sr, ec, new_end_row)
                    if has_dollar:
                        # Add $ signs for absolute reference format
                        # Correctly handle multi-letter columns (e.g., AA1 -> $AA$1, not $A$A1)
                        def to_absolute(part: str) -> str:
                            col_str = ""
                            row_str = ""
                            for ch in part:
                                if ch.isalpha():
                                    col_str += ch
                                else:
                                    row_str += ch
                            return f"${col_str}${row_str}"

                        parts = new_ref.split(":")
                        new_ref = ":".join(to_absolute(part) for part in parts)
                    auto_filter.set("ref", new_ref)
                    print(f"  Expanded autoFilter ref: {current_ref} -> {new_ref}")

    def update_table_ref(self, sheet_id: int, table_name: str, data_start: int, num_data_rows: int):
        """Update table reference to cover all data rows."""
        table_file = f"xl/tables/table{sheet_id - 1}.xml"  # Table_1 is table1.xml, Table_2 is table2.xml
        if table_name == "Table_2":
            table_file = "xl/tables/table2.xml"
        elif table_name == "Table_1":
            table_file = "xl/tables/table1.xml"

        content = self.zip_data.get(table_file, b"")
        if not content:
            return

        root = ET.fromstring(content)
        ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"

        # Current ref is like A1:O24
        current_ref = root.get("ref", "")
        if not current_ref:
            return

        sc, sr, ec, er = parse_range_ref(current_ref)
        # Header row is sr (usually 1), data ends at er
        # We need to expand to cover all data rows
        new_end_row = data_start + num_data_rows - 1
        if new_end_row > er:
            new_ref = build_range_ref(sc, sr, ec, new_end_row)
            root.set("ref", new_ref)
            print(f"  Expanded {table_name} ref: {current_ref} -> {new_ref}")
            ET.indent(root, space="")
            self.zip_data[table_file] = ET.tostring(root, encoding="utf-8", xml_declaration=True)

    def apply_design_rules(self):
        """Post-process design corrections agreed with the user:
        - FORMATO_CENSOS: every data cell is left-aligned (no mixed right/center).
        - REPORTE ALTAS/BAJAS: drop the Excel table objects (Table_1/Table_2)
          so the sheets look like the plain-range ministerial census; the cell
          styles (blue headers, borders, centered data) are preserved by
          rewriting the cell style ids instead of relying on tableStyleInfo.
        """
        self._left_align_censo_data()
        self._ensure_altas_bajas_headers()
        self._strip_altas_bajas_tables()
        self._set_vigente_desde()

    def _left_align_censo_data(self):
        """Force horizontal=left on every data cell of FORMATO_CENSOS.

        The template's prepared data rows carry style ids with a mix of
        horizontal right/center/left. To keep the template bytes untouched we
        clone the needed styles into styles.xml with horizontal=left, then
        remap each data cell's `s` attribute to the new style id.
        """
        styles = self._load_styles()
        cell_xfs = styles.find(f"{{{NS['main']}}}cellXfs")
        if cell_xfs is None:
            return
        xf_list = list(cell_xfs)

        sheet_file = "xl/worksheets/sheet1.xml"
        sheet_xml = self.zip_data.get(sheet_file, b"")
        if not sheet_xml:
            return
        root = ET.fromstring(sheet_xml)
        ns = NS["main"]
        tab = TABS["FORMATO_CENSOS"]
        data_start = tab["data_start"]

        remap = {}
        for row in root.findall(f".//{{{ns}}}sheetData/{{{ns}}}row"):
            row_num = int(row.get("r", "0"))
            if row_num < data_start:
                continue
            for cell in row.findall(f".//{{{ns}}}c"):
                ref = cell.get("r", "")
                if not ref:
                    continue
                col_idx, _ = parse_cell_ref(ref)
                if col_idx > 18:  # columns beyond R are not census data
                    continue
                style_id = cell.get("s")
                if style_id is None:
                    continue
                if style_id not in remap:
                    remap[style_id] = self._clone_style_left(xf_list, styles, int(style_id))
                cell.set("s", str(remap[style_id]))

        if remap:
            self._write_styles(styles)
        ET.indent(root, space="")
        self.zip_data[sheet_file] = ET.tostring(root, encoding="utf-8", xml_declaration=True)
        print(f"  FORMATO_CENSOS: left-aligned data cells ({len(remap)} styles remapped)")

    def _clone_style_left(self, xf_list, styles_root, source_idx: int) -> int:
        """Deep-copy a cellXfs entry with horizontal=left and return its new id."""
        ns = NS["main"]
        xf_parent = styles_root.find(f"{{{ns}}}cellXfs")
        source = xf_list[source_idx]
        new_xf = copy.deepcopy(source)
        alignment = new_xf.find(f"{{{ns}}}alignment")
        if alignment is None:
            alignment = ET.SubElement(new_xf, f"{{{ns}}}alignment")
            alignment.set("vertical", "center")
        alignment.set("horizontal", "left")
        new_xf.set("applyAlignment", "1")
        xf_parent.append(new_xf)
        return len(xf_list)

    def _load_styles(self):
        return ET.fromstring(self.zip_data.get("xl/styles.xml", b"<styles/>"))

    def _write_styles(self, styles_root):
        ET.indent(styles_root, space="")
        self.zip_data["xl/styles.xml"] = ET.tostring(styles_root, encoding="utf-8", xml_declaration=True)

    def _ensure_altas_bajas_headers(self):
        """Guarantee ALTAS/BAJAS header cells stay visible after table removal.

        The template header cells A1-D1 carry a WHITE bold font but an EMPTY
        fill; the blue header background came from the Excel table style. Once
        the table is removed, those cells would show white-on-white. Clone the
        header styles so every header cell gets the blue fill explicitly.
        """
        styles = self._load_styles()
        cell_xfs = styles.find(f"{{{NS['main']}}}cellXfs")
        if cell_xfs is None:
            return
        xf_list = list(cell_xfs)

        fills = styles.find(f"{{{NS['main']}}}fills")
        blue_fill_id = None
        # Find the template's solid blue fill (theme 4, used by the header row).
        if fills is not None:
            for i, fill in enumerate(fills.findall(f"{{{NS['main']}}}fill")):
                pat = fill.find(f"{{{NS['main']}}}patternFill")
                if pat is None or pat.get("patternType") != "solid":
                    continue
                fg = pat.find(f"{{{NS['main']}}}fgColor")
                if fg is not None and fg.get("theme") == "4":
                    blue_fill_id = i
                    break
        if blue_fill_id is None:
            return

        for sheet_id in (2, 3):
            sheet_file = f"xl/worksheets/sheet{sheet_id}.xml"
            sheet_xml = self.zip_data.get(sheet_file, b"")
            if not sheet_xml:
                continue
            root = ET.fromstring(sheet_xml)
            ns = NS["main"]
            for row in root.findall(f".//{{{ns}}}sheetData/{{{ns}}}row"):
                if int(row.get("r", "0")) != 1:
                    continue
                for cell in row.findall(f".//{{{ns}}}c"):
                    style_id = cell.get("s")
                    if style_id is None:
                        continue
                    idx = int(style_id)
                    xf = xf_list[idx]
                    # If this xf already has a fill, keep it; otherwise clone
                    # with the blue fill so white header text stays visible.
                    if xf.get("fillId") not in (None, "0"):
                        continue
                    new_xf = copy.deepcopy(xf)
                    new_xf.set("fillId", str(blue_fill_id))
                    new_xf.set("applyFill", "1")
                    cell_xfs.append(new_xf)
                    cell.set("s", str(len(xf_list)))
                    xf_list = list(cell_xfs)
            ET.indent(root, space="")
            self.zip_data[sheet_file] = ET.tostring(root, encoding="utf-8", xml_declaration=True)

        self._write_styles(styles)
        print("  ALTAS/BAJAS: header cells given explicit blue fill")

    def _set_vigente_desde(self):
        """Update the template's 'VIGENTE DESDE' cell (R5) to today's date.

        The template ships a hardcoded serial date (45006 = 2023-03-21).
        The generated file must show the generation date instead, written as
        an Excel serial number (the cell already has a date number format).
        """
        sheet_file = "xl/worksheets/sheet1.xml"
        sheet_xml = self.zip_data.get(sheet_file, b"")
        if not sheet_xml:
            return
        root = ET.fromstring(sheet_xml)
        ns = NS["main"]
        today = datetime.now()
        epoch = datetime(1899, 12, 30)
        serial = (today - epoch).days
        for row in root.findall(f".//{{{ns}}}sheetData/{{{ns}}}row"):
            if int(row.get("r", "0")) != 5:
                continue
            for cell in row.findall(f".//{{{ns}}}c"):
                if cell.get("r") == "R5":
                    for child in list(cell):
                        if child.tag.endswith("}v") or child.tag.endswith("}is"):
                            cell.remove(child)
                    v = ET.SubElement(cell, f"{{{ns}}}v")
                    v.text = str(serial)
                    if "t" in cell.attrib:
                        del cell.attrib["t"]
        ET.indent(root, space="")
        self.zip_data[sheet_file] = ET.tostring(root, encoding="utf-8", xml_declaration=True)
        print(f"  FORMATO_CENSOS: VIGENTE DESDE set to {today:%d/%m/%Y} (serial {serial})")

    def _strip_altas_bajas_tables(self):
        """Remove Excel table objects from REPORTE ALTAS / REPORTE BAJAS.

        Removes the tablePart reference from the sheets, the table relationship
        from the sheet rels, and drops xl/tables/table1.xml + table2.xml from
        the output. Cell-level styles (blue header fill, borders) are preserved
        because the style ids stay on the cells; only tableStyleInfo is gone.
        """
        table_files = ["xl/tables/table1.xml", "xl/tables/table2.xml"]
        for table_file in table_files:
            self.zip_data.pop(table_file, None)
            rel = f"{table_file}.rels"
            self.zip_data.pop(rel, None)

        for sheet_id, table_id in ((2, 1), (3, 2)):
            sheet_file = f"xl/worksheets/sheet{sheet_id}.xml"
            rels_file = f"xl/worksheets/_rels/sheet{sheet_id}.xml.rels"

            sheet_xml = self.zip_data.get(sheet_file, b"")
            if sheet_xml:
                root = ET.fromstring(sheet_xml)
                ns = NS["main"]
                for tp in root.findall(f".//{{{ns}}}tableParts"):
                    root.remove(tp)
                ET.indent(root, space="")
                self.zip_data[sheet_file] = ET.tostring(root, encoding="utf-8", xml_declaration=True)

            rels_xml = self.zip_data.get(rels_file, b"")
            if rels_xml:
                rel_ns = "http://schemas.openxmlformats.org/package/2006/relationships"
                rel_root = ET.fromstring(rels_xml)
                for rel_elem in list(rel_root):
                    target = rel_elem.get("Target", "")
                    if target.endswith(f"tables/table{table_id}.xml"):
                        rel_root.remove(rel_elem)
                ET.indent(rel_root, space="")
                self.zip_data[rels_file] = ET.tostring(rel_root, encoding="utf-8", xml_declaration=True)

        print("  ALTAS/BAJAS: Excel table objects removed (plain range)")

    def run(self, output_path: Path):
        """Main execution."""
        print("Loading template...")
        self.load_template()

        print("Parsing shared strings...")
        self.parse_shared_strings()

        print("Building column maps from headers...")
        self.build_col_maps()

        print("Filling sheet data...")
        # Track the maximum data row across all sheets
        max_data_row = 0
        for sheet_name in TABS:
            print(f"  Processing {sheet_name}...")
            self.update_sheet_data(sheet_name)
            tab = TABS[sheet_name]
            data_end = tab["data_start"] + len(self.data.get(tab["data_key"], [])) - 1
            if self.data.get(tab["data_key"], []):
                max_data_row = max(max_data_row, data_end)

        # Ensure all sheets with tables have rows up to max_data_row (for consistent styling)
        if max_data_row > 0:
            self.extend_sheets_to_max_row(max_data_row)

        print("Applying design rules...")
        self.apply_design_rules()

        print("Saving shared strings...")
        self.save_shared_strings()

        print(f"Saving output to {output_path}...")
        self.save_output(output_path)
        print("Done!")

    def extend_sheets_to_max_row(self, max_row: int):
        """Extend all sheets with tables to have rows up to max_row by cloning last prepared row."""
        for sheet_name, tab in TABS.items():
            if not tab["table_name"]:
                continue  # Only extend sheets with tables (ALTAS/BAJAS)

            sheet_file = f"xl/worksheets/sheet{tab['sheet_id']}.xml"
            sheet_xml = self.zip_data.get(sheet_file, b"")
            if not sheet_xml:
                continue
            root = ET.fromstring(sheet_xml)
            ns = NS["main"]

            sheet_data_elem = root.find(f".//{{{ns}}}sheetData")
            if sheet_data_elem is None:
                continue

            # Find last prepared row
            last_prepared_row_elem = None
            for row in sheet_data_elem.findall(f".//{{{ns}}}row"):
                row_num = int(row.get("r", "0"))
                if row_num == tab["max_prepared_rows"]:
                    last_prepared_row_elem = row
                    break

            if last_prepared_row_elem is None:
                continue

            # Extend rows from max_prepared_rows + 1 to max_row
            for target_row in range(tab["max_prepared_rows"] + 1, max_row + 1):
                # Check if row already exists
                existing = None
                for row in sheet_data_elem.findall(f".//{{{ns}}}row"):
                    if int(row.get("r", "0")) == target_row:
                        existing = row
                        break

                if existing is not None:
                    # Row exists but may be empty - clone style from last prepared
                    # Remove existing cells and replace with cloned ones
                    for cell in list(existing.findall(f".//{{{ns}}}c")):
                        existing.remove(cell)
                    # Clone cells from last prepared row
                    for cell in last_prepared_row_elem.findall(f".//{{{ns}}}c"):
                        new_cell = copy.deepcopy(cell)
                        old_ref = new_cell.get("r", "")
                        if old_ref:
                            col_idx, _ = parse_cell_ref(old_ref)
                            new_ref = f"{col_idx_to_letter(col_idx)}{target_row}"
                            new_cell.set("r", new_ref)
                        # Clear values but keep style
                        for child in list(new_cell):
                            if child.tag.endswith("}v") or child.tag.endswith("}is"):
                                new_cell.remove(child)
                        if new_cell.get("t") == "s":
                            del new_cell.attrib["t"]
                        existing.append(new_cell)
                    # Copy row attributes
                    for attr in ["ht", "customHeight", "customFormat", "s"]:
                        val = last_prepared_row_elem.get(attr)
                        if val is not None:
                            existing.set(attr, val)
                else:
                    # Create new row by cloning
                    new_row = copy.deepcopy(last_prepared_row_elem)
                    new_row.set("r", str(target_row))
                    # Update cell references
                    for cell in new_row.findall(f".//{{{ns}}}c"):
                        old_ref = cell.get("r", "")
                        if old_ref:
                            col_idx, _ = parse_cell_ref(old_ref)
                            new_ref = f"{col_idx_to_letter(col_idx)}{target_row}"
                            cell.set("r", new_ref)
                        # Clear values but keep style
                        for child in list(cell):
                            if child.tag.endswith("}v") or child.tag.endswith("}is"):
                                cell.remove(child)
                        if cell.get("t") == "s":
                            del cell.attrib["t"]
                    sheet_data_elem.append(new_row)

            # Save updated sheet
            ET.indent(root, space="")
            self.zip_data[sheet_file] = ET.tostring(root, encoding="utf-8", xml_declaration=True)


def main():
    parser = argparse.ArgumentParser(description="Genera el censo ministerial con las 3 pestañas")
    parser.add_argument("--data", required=True, help="JSON con censo/altas/bajas (producido por el backend)")
    parser.add_argument("--template", default=os.path.join(os.path.dirname(__file__), TEMPLATE),
                        help="Ruta al template ministerial (default: junto al script)")
    parser.add_argument("--output", default=None,
                        help=f"Ruta de salida (default: censo-{datetime.now().year}.xlsx junto al template)")
    args = parser.parse_args()

    # Load data
    with open(args.data, encoding="utf-8") as f:
        data = json.load(f)

    # Determine default output: censo-{year}.xlsx
    output = args.output or os.path.join(
        os.path.dirname(args.template), f"censo-{datetime.now().year}.xlsx"
    )

    # Copy template (NEVER modify it directly) and fill
    shutil.copy2(args.template, output)
    print(f"Template copied to: {output}")

    filler = TemplateFiller(Path(output), data)
    filler.run(Path(output))

    print(f"\n[OK] Archivo generado: {output}")


if __name__ == "__main__":
    main()
