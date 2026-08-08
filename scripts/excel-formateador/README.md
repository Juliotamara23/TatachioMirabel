# Excel Formateador (Ministerio del Interior)

Genera el archivo **`censo-{año}.xlsx`** llenando las 3 pestañas del
template ministerial con los datos de la DB. El formato final es el del
template (preserva celdas combinadas, estilos y estructura institucional).

## Flujo

```
Backend (Node) consulta DB (Prisma) → JSON → formateador.py → censo-2026.xlsx
```

El backend es la fuente de verdad y normaliza los datos (códigos, mayúsculas,
fechas DD/MM/YYYY). El script solo abre UNA copia del template y escribe.

## Requisitos

- Python 3.13+
- `pip install -r scripts/excel-formateador/requirements.txt` (solo openpyxl)

## Uso

```bash
python scripts/excel-formateador/formateador.py \
    --data <datos.json> \
    [--template <Formato Censal.xlsx>] \
    [--output <censo-2026.xlsx>]
```

- `--data`: JSON con las 3 secciones: `{"censo": [...], "altas": [...], "bajas": [...]}`.
  Cada fila es un dict con las claves = nombres de columnas del template.
- `--template`: template ministerial (default: `templates/Formato Censal.xlsx` junto al script).
  El template NUNCA se modifica — siempre se trabaja sobre una copia.
- `--output`: ruta de salida (default: `censo-{año actual}.xlsx` junto al template).

## Estructura del template (3 pestañas)

| Pestaña | Encabezados | Datos desde | Columnas |
|---------|-------------|-------------|----------|
| `FORMATO_CENSOS` | Fila 6 | Fila 7 | 18 (A-R) |
| `REPORTE ALTAS` | Fila 1 | Fila 2 | 15 (A-O, NOVEDAD al final) |
| `REPORTE BAJAS` | Fila 1 | Fila 2 | 15 (A-O, NOVEDAD al final) |

## Notas de arquitectura

- **Stack verificado con evidencia**: openpyxl preserva imagen/merged/estilos;
  exceljs CRASHA con templates que tienen imágenes (descartado); pandas no
  aporta (la fuente es la DB, no un Excel externo).
- **El análisis de inconsistencias NO vive aquí**: el backend valida en
  escritura (duplicados → 409, edad >99 → `warnings[]`).
- Script de proceso bajo demanda, no un servicio.
