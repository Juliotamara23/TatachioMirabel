# Excel Formateador (Ministerio del Interior)

Script Python que formatea censos para el formato oficial del Ministerio
del Interior de Colombia. Portado al monorepo desde
[AnalisisCensal](https://github.com/Juliotamara23/AnalisisCensal) para no
duplicar funcionalidades: el análisis de datos vive en el backend Node
(TatachioMirabel); este script cubre SOLO la entrega ministerial.

## Qué hace

1. **Valida** que el archivo origen sea compatible con la plantilla del Ministerio
2. **Transforma** los datos según los mapeos oficiales (códigos, mayúsculas, fechas DD/MM/YYYY, documentos limpios)
3. **Inyecta** en la plantilla copiando el archivo de referencia (preservando logos, celdas combinadas y estructura) y escribiendo solo las filas de datos con openpyxl celda a celda

## Requisitos

- Python 3.13+
- `pip install -r scripts/excel-formateador/requirements.txt` (pandas + openpyxl)

## Uso

```bash
python scripts/excel-formateador/formateador.py \
    --origen <datos.xlsx> \
    --plantilla <plantilla-ministerio.xlsx> \
    --destino <salida.xlsx>
```

- `--origen`: archivo Excel con datos (puede ser export del backend con estructura ministerial, o cuestionario externo)
- `--plantilla`: plantilla oficial del Ministerio (NO se sube al repo — propiedad ministerial, pásala por ruta local)
- `--destino`: archivo de salida

## Notas de arquitectura

- **El análisis de inconsistencias NO vive aquí**: el backend valida en escritura
  (duplicados → 409 por unique constraint; edad >99 → `warnings[]` no bloqueante).
- **pandas se usa solo para leer/transformar el origen**; el formateo final es
  openpyxl celda a celda para preservar la integridad visual de la plantilla.
- Este es un script de proceso externo, no un servicio: se ejecuta bajo demanda
  cuando se necesita el reporte ministerial.
