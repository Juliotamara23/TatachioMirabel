---
name: xlsx
description: Generate Excel spreadsheets from backend data using SheetJS. Use when creating .xlsx reports, exporting database data to Excel, or generating structured spreadsheets for government census reports. Triggers on "xlsx", "Excel", "spreadsheet", "report", "export".
---

# XLSX — SheetJS in TypeScript

This project generates Colombian government census reports (cabildo members) using the **SheetJS** npm package (`xlsx`) in TypeScript. No Python, no openpyxl, no pandas.

## Import Pattern

```typescript
import * as XLSX from "xlsx";
```

## Core Patterns

### Creating a Workbook from Data

```typescript
import * as XLSX from "xlsx";

interface MemberRecord {
  id: string;
  name: string;
  documentType: string;
  documentNumber: string;
  birthDate: string;
  role: string;
}

const data: MemberRecord[] = [];

const worksheet = XLSX.utils.json_to_sheet(data);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, "Miembros");

XLSX.writeFile(workbook, "reporte-censo.xlsx");
```

### Reading a Workbook from Buffer

```typescript
import * as XLSX from "xlsx";

const buffer = fs.readFileSync("template.xlsx");
const workbook = XLSX.read(buffer, { type: "buffer" });

const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data: MemberRecord[] = XLSX.utils.sheet_to_json(worksheet);
```

### Setting Column Widths

```typescript
const worksheet = XLSX.utils.json_to_sheet(data);

worksheet["!cols"] = [
  { wch: 20 },
  { wch: 15 },
  { wch: 18 },
  { wch: 15 },
  { wch: 20 },
];
```

### Multi-Sheet Reports

```typescript
const workbook = XLSX.utils.book_new();

const membersSheet = XLSX.utils.json_to_sheet(members);
XLSX.utils.book_append_sheet(workbook, membersSheet, "Miembros");

const dependentsSheet = XLSX.utils.json_to_sheet(dependents);
XLSX.utils.book_append_sheet(workbook, dependentsSheet, "Dependientes");

const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumen");

XLSX.writeFile(workbook, "reporte-completo.xlsx");
```

### Generating Reports from Prisma Data

```typescript
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const prisma = new PrismaClient();

export async function generateCensusReport(): Promise<Buffer> {
  const members = await prisma.miembro.findMany({
    include: { familia: true },
    orderBy: { apellidos: "asc" },
  });

  const rows = members.map((m) => ({
    "Tipo Documento": m.tipoIdentificacion,
    "Número Documento": m.numeroDocumento,
    Nombres: m.nombres,
    Apellidos: m.apellidos,
    "Fecha Nacimiento": m.fechaNacimiento,
    Parentesco: m.parentesco,
    Sexo: m.sexo,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = rows.length > 0
    ? Object.keys(rows[0]).map((key) => ({ wch: Math.max(key.length + 4, 15) }))
    : [];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Censo");

  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}
```

### Sending Excel as HTTP Response

```typescript
import { Request, Response } from "express";

export async function downloadCensusReport(_req: Request, res: Response) {
  const buffer = await generateCensusReport();

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="censo-${new Date().toISOString().split("T")[0]}.xlsx"`
  );
  res.send(buffer);
}
```

## Key API Reference

| Function | Purpose |
|----------|---------|
| `XLSX.utils.json_to_sheet(data)` | Convert JSON array to worksheet |
| `XLSX.utils.sheet_to_json(sheet)` | Convert worksheet to JSON array |
| `XLSX.utils.book_new()` | Create new workbook |
| `XLSX.utils.book_append_sheet(wb, ws, name)` | Add sheet to workbook |
| `XLSX.read(buffer, opts)` | Parse workbook from buffer |
| `XLSX.write(wb, opts)` | Write workbook to buffer |
| `XLSX.writeFile(wb, filename)` | Write workbook to file |

## CSV / TSV

```typescript
// Read CSV
const workbook = XLSX.read(csvBuffer, { type: "buffer", raw: true });
const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

// Write CSV
const csv = XLSX.utils.sheet_to_csv(worksheet);
```

Ask the orchestrator before running any commands.
