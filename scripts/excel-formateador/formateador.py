#!/usr/bin/env python3
"""
Genera el archivo censo-{año}.xlsx llenando las 3 pestañas del template
ministerial con los datos de la DB.

Flujo (sin sobre-ingeniería): el backend consulta la DB (fuente de verdad),
serializa los datos como JSON, y este script usa openpyxl para abrir UNA copia
del template y llenar las 3 pestañas. El formato final es el del template.

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
import json
import os
import shutil
from datetime import datetime

from openpyxl import load_workbook

# Pestaña -> (fila de encabezados, fila donde empiezan los datos)
TEMPLATE = "templates/Formato Censal.xlsx"
TABS = {
    "FORMATO_CENSOS": {"header_row": 6, "data_start": 7, "data_key": "censo"},
    "REPORTE ALTAS": {"header_row": 1, "data_start": 2, "data_key": "altas"},
    "REPORTE BAJAS": {"header_row": 1, "data_start": 2, "data_key": "bajas"},
}


def mapear_columnas(ws, header_row):
    """Mapea nombre de columna (header) -> índice de columna."""
    col_map = {}
    for col in range(1, ws.max_column + 1):
        header = ws.cell(row=header_row, column=col).value
        if header is None:
            continue
        key = str(header).strip().upper().replace(" ", "")
        col_map[key] = col
    return col_map


def llenar_pestana(wb, tab_name, rows):
    """Escribe las filas en una pestaña desde la fila de datos."""
    if tab_name not in wb.sheetnames:
        print(f"  ⚠ pestaña '{tab_name}' no existe en el template — se omite")
        return

    ws = wb[tab_name]
    tab = TABS[tab_name]
    col_map = mapear_columnas(ws, tab["header_row"])

    # Limpiar filas de datos previas (dejar solo encabezados)
    for row in range(tab["data_start"], ws.max_row + 1):
        for col in range(1, ws.max_column + 1):
            ws.cell(row=row, column=col).value = None

    for r_idx, row_data in enumerate(rows, start=tab["data_start"]):
        for key, value in row_data.items():
            col = col_map.get(str(key).strip().upper().replace(" ", ""))
            if col is None:
                continue
            ws.cell(row=r_idx, column=col, value=value)

    print(f"  ✅ {tab_name}: {len(rows)} filas")


def main():
    parser = argparse.ArgumentParser(description="Genera el censo ministerial con las 3 pestañas")
    parser.add_argument("--data", required=True, help="JSON con censo/altas/bajas (producido por el backend)")
    parser.add_argument("--template", default=os.path.join(os.path.dirname(__file__), TEMPLATE),
                        help="Ruta al template ministerial (default: junto al script)")
    parser.add_argument("--output", default=None,
                        help=f"Ruta de salida (default: censo-{datetime.now().year}.xlsx junto al template)")
    args = parser.parse_args()

    # Cargar datos
    with open(args.data, encoding="utf-8") as f:
        data = json.load(f)

    # Determinar salida por defecto: censo-{año}.xlsx
    output = args.output or os.path.join(
        os.path.dirname(args.template), f"censo-{datetime.now().year}.xlsx"
    )

    # Copiar el template (NUNCA modificarlo directamente) y llenar
    shutil.copy2(args.template, output)
    print(f"Template copiado a: {output}")

    wb = load_workbook(output)
    for tab_name, tab in TABS.items():
        llenar_pestana(wb, tab_name, data.get(tab["data_key"], []))
    wb.save(output)
    wb.close()

    print(f"\n[OK] Archivo generado: {output}")


if __name__ == "__main__":
    main()
