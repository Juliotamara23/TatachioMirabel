import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface NormalizeOptions {
  dryRun: boolean;
  verbose: boolean;
}

interface FamilyChange {
  familiaId: string;
  oldNumero: number;
  newNumero: number;
}

interface MemberChange {
  miembroId: string;
  oldIntegrantes: number;
  newIntegrantes: number;
}

interface CabildoResult {
  cabildoId: string;
  cabildoNombre: string;
  familiesChanged: number;
  familyChanges: FamilyChange[];
}

interface FamilyResult {
  familiaId: string;
  familiaNumero: number;
  membersChanged: number;
  memberChanges: MemberChange[];
}

/**
 * Parse command line arguments
 */
function parseArgs(): NormalizeOptions {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    verbose: args.includes("--verbose"),
  };
}

/**
 * Normalize family numbers for a single cabildo
 * Returns the list of changes made (or would be made in dry-run)
 */
async function normalizeFamiliesInCabildo(
  cabildoId: string,
  options: NormalizeOptions,
): Promise<CabildoResult> {
  // Get all families in this cabildo ordered by current numero
  const families = await prisma.familia.findMany({
    where: { cabildoId },
    orderBy: { numero: "asc" },
    select: { id: true, numero: true },
  });

  const cabildo = await prisma.cabildo.findUnique({
    where: { id: cabildoId },
    select: { nombre: true },
  });

  const changes: FamilyChange[] = [];
  let newNumero = 1;

  for (const family of families) {
    if (family.numero !== newNumero) {
      changes.push({
        familiaId: family.id,
        oldNumero: family.numero,
        newNumero,
      });

      if (!options.dryRun) {
        await prisma.familia.update({
          where: { id: family.id },
          data: { numero: newNumero },
        });
      }

      if (options.verbose) {
        console.log(
          `  [Familia] ${family.id}: numero ${family.numero} -> ${newNumero}${options.dryRun ? " (dry-run)" : ""}`,
        );
      }
    }
    newNumero++;
  }

  return {
    cabildoId,
    cabildoNombre: cabildo?.nombre ?? "unknown",
    familiesChanged: changes.length,
    familyChanges: changes,
  };
}

/**
 * Normalize integrantes for a single family
 * Returns the list of changes made (or would be made in dry-run)
 */
async function normalizeIntegrantesInFamily(
  familiaId: string,
  options: NormalizeOptions,
): Promise<FamilyResult> {
  // Get all members in this family ordered by current integrantes, then createdAt
  const members = await prisma.miembro.findMany({
    where: { familiaId },
    orderBy: [{ integrantes: "asc" }, { createdAt: "asc" }],
    select: { id: true, integrantes: true, createdAt: true },
  });

  const familia = await prisma.familia.findUnique({
    where: { id: familiaId },
    select: { numero: true },
  });

  const changes: MemberChange[] = [];
  let newIntegrantes = 1;

  for (const member of members) {
    if (member.integrantes !== newIntegrantes) {
      changes.push({
        miembroId: member.id,
        oldIntegrantes: member.integrantes,
        newIntegrantes,
      });

      if (!options.dryRun) {
        await prisma.miembro.update({
          where: { id: member.id },
          data: { integrantes: newIntegrantes },
        });
      }

      if (options.verbose) {
        console.log(
          `    [Miembro] ${member.id}: integrantes ${member.integrantes} -> ${newIntegrantes}${options.dryRun ? " (dry-run)" : ""}`,
        );
      }
    }
    newIntegrantes++;
  }

  return {
    familiaId,
    familiaNumero: familia?.numero ?? 0,
    membersChanged: changes.length,
    memberChanges: changes,
  };
}

/**
 * Main normalization function
 */
async function normalizeCensusData(options: NormalizeOptions): Promise<void> {
  const mode = options.dryRun ? "DRY-RUN" : "LIVE";
  console.log(`\n=== Census Data Normalization (${mode}) ===\n`);

  // Get all cabildos
  const cabildos = await prisma.cabildo.findMany({
    select: { id: true, nombre: true },
  });

  if (cabildos.length === 0) {
    console.log("No cabildos found. Nothing to normalize.");
    return;
  }

  let totalFamiliesChanged = 0;
  let totalMembersChanged = 0;
  const cabildoResults: CabildoResult[] = [];
  const familyResults: FamilyResult[] = [];

  // Process each cabildo in a transaction for atomicity
  for (const cabildo of cabildos) {
    if (options.verbose) {
      console.log(`\nProcessing cabildo: ${cabildo.nombre} (${cabildo.id})`);
    }

    // Normalize families within this cabildo
    const cabildoResult = await prisma.$transaction(async (tx) => {
      // We need to re-query inside transaction for consistency
      const families = await tx.familia.findMany({
        where: { cabildoId: cabildo.id },
        orderBy: { numero: "asc" },
        select: { id: true, numero: true },
      });

      const changes: FamilyChange[] = [];
      let newNumero = 1;

      for (const family of families) {
        if (family.numero !== newNumero) {
          changes.push({
            familiaId: family.id,
            oldNumero: family.numero,
            newNumero,
          });

          if (!options.dryRun) {
            await tx.familia.update({
              where: { id: family.id },
              data: { numero: newNumero },
            });
          }

          if (options.verbose) {
            console.log(
              `  [Familia] ${family.id}: numero ${family.numero} -> ${newNumero}${options.dryRun ? " (dry-run)" : ""}`,
            );
          }
        }
        newNumero++;
      }

      return {
        cabildoId: cabildo.id,
        cabildoNombre: cabildo.nombre,
        familiesChanged: changes.length,
        familyChanges: changes,
      };
    });

    cabildoResults.push(cabildoResult);
    totalFamiliesChanged += cabildoResult.familiesChanged;

    // Now normalize integrantes for each family in this cabildo
    // We do this family by family to keep transactions smaller
    const familiesInCabildo = await prisma.familia.findMany({
      where: { cabildoId: cabildo.id },
      select: { id: true, numero: true },
    });

    for (const family of familiesInCabildo) {
      if (options.verbose) {
        console.log(`  Processing family #${family.numero} (${family.id})`);
      }

      const familyResult = await prisma.$transaction(async (tx) => {
        const members = await tx.miembro.findMany({
          where: { familiaId: family.id },
          orderBy: [{ integrantes: "asc" }, { createdAt: "asc" }],
          select: { id: true, integrantes: true, createdAt: true },
        });

        const changes: MemberChange[] = [];
        let newIntegrantes = 1;

        for (const member of members) {
          if (member.integrantes !== newIntegrantes) {
            changes.push({
              miembroId: member.id,
              oldIntegrantes: member.integrantes,
              newIntegrantes,
            });

            if (!options.dryRun) {
              await tx.miembro.update({
                where: { id: member.id },
                data: { integrantes: newIntegrantes },
              });
            }

            if (options.verbose) {
              console.log(
                `    [Miembro] ${member.id}: integrantes ${member.integrantes} -> ${newIntegrantes}${options.dryRun ? " (dry-run)" : ""}`,
              );
            }
          }
          newIntegrantes++;
        }

        return {
          familiaId: family.id,
          familiaNumero: family.numero,
          membersChanged: changes.length,
          memberChanges: changes,
        };
      });

      familyResults.push(familyResult);
      totalMembersChanged += familyResult.membersChanged;
    }
  }

  // Print summary
  console.log(`\n=== Summary ===`);
  console.log(`Mode: ${mode}`);
  console.log(`Cabildos processed: ${cabildos.length}`);
  console.log(`Families normalized: ${totalFamiliesChanged}`);
  console.log(`Members normalized: ${totalMembersChanged}`);

  if (options.verbose) {
    console.log(`\n=== Detailed Changes ===`);

    for (const cabildoResult of cabildoResults) {
      if (cabildoResult.familiesChanged > 0) {
        console.log(
          `\nCabildo: ${cabildoResult.cabildoNombre} (${cabildoResult.cabildoId}) - ${cabildoResult.familiesChanged} families changed`,
        );
        for (const change of cabildoResult.familyChanges) {
          console.log(
            `  Familia ${change.familiaId}: ${change.oldNumero} -> ${change.newNumero}`,
          );
        }
      }
    }

    for (const familyResult of familyResults) {
      if (familyResult.membersChanged > 0) {
        console.log(
          `\nFamilia #${familyResult.familiaNumero} (${familyResult.familiaId}) - ${familyResult.membersChanged} members changed`,
        );
        for (const change of familyResult.memberChanges) {
          console.log(
            `  Miembro ${change.miembroId}: ${change.oldIntegrantes} -> ${change.newIntegrantes}`,
          );
        }
      }
    }
  }

  if (totalFamiliesChanged === 0 && totalMembersChanged === 0) {
    console.log("\n✓ Data is already normalized. No changes needed.");
  } else if (options.dryRun) {
    console.log(
      "\n⚠ This was a dry-run. Run without --dry-run to apply changes.",
    );
  } else {
    console.log("\n✓ Normalization completed successfully.");
  }
}

// CLI entry point
const options = parseArgs();

normalizeCensusData(options)
  .then(() => {
    console.log("");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n✗ Normalization failed:", err.message);
    if (options.verbose) {
      console.error(err.stack);
    }
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
