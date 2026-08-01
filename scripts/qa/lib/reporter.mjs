import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * scripts/qa/lib/reporter.mjs
 *
 * Simple report aggregator that collects test results and outputs
 * qa-report.json + JUnit XML for the QA toolkit.
 */

// Get the current git commit, gracefully handling "not a git repo"
let commit = "unknown";
try {
  commit = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
} catch (_) {
  // silently fall back to "unknown" if not in a git repo
}

/**
 * Reporter state
 */
const reporter = {
  _commit: commit,
  _timestamp: null, // Will be set when generating report
  _summaries: {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration_ms: 0,
  },
  _by_suite: {},
  _failures: [],
};

/**
 * Create a new reporter instance
 * @returns {Object} Reporter instance
 */
export function createReporter() {
  return {
    _commit: reporter._commit,
    _timestamp: null,
    _summaries: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration_ms: 0,
    },
    _by_suite: {},
    _failures: [],
  };
}

/**
 * Add a test suite result to the reporter
 * @param {Object} rep Reporter instance
 * @param {string} name Suite name
 * @param {Object} results Suite results
 * @param {number} results.total Total tests in suite
 * @param {number} results.passed Passed tests
 * @param {number} results.failed Failed tests
 * @param {number} results.skipped Skipped tests
 * @param {number} results.duration_ms Suite duration in milliseconds
 * @param {Array} results.failures Array of failure objects
 */
export function addSuite(rep, name, results) {
  // Update summary totals
  rep._summaries.total += results.total;
  rep._summaries.passed += results.passed;
  rep._summaries.failed += results.failed;
  rep._summaries.skipped += results.skipped;
  rep._summaries.duration_ms += results.duration_ms;

  // Store per-suite summary
  rep._by_suite[name] = {
    total: results.total,
    passed: results.passed,
    failed: results.failed,
    skipped: results.skipped,
    duration_ms: results.duration_ms,
  };

  // Store individual failures with suite context
  if (Array.isArray(results.failures)) {
    for (const failure of results.failures) {
      rep._failures.push({
        suite: name,
        test: failure.test,
        expected: failure.expected,
        actual: failure.actual,
        detail: failure.detail,
      });
    }
  }
}

/**
 * Generate the report as JSON and XML
 * @param {Object} rep Reporter instance
 * @returns {{json: Object, xml: string} | null} Report object or null if no suites
 */
export function generateReport(rep) {
  if (rep._summaries.total === 0) {
    return null;
  }

  // Set timestamp in ISO 8601 format
  const timestamp = new Date().toISOString();

  // Determine verdict
  let verdict = "PASS";
  if (rep._summaries.failed > 0) {
    verdict = "WARN";
  }

  // Check for BLOCKED conditions
  for (const [suiteName, suiteData] of Object.entries(rep._by_suite)) {
    if (suiteName.toLowerCase().includes("auth") && suiteData.failed > 0) {
      verdict = "BLOCKED";
      break;
    }
  }

  // Check for failures with blocker: true (if provided in detail)
  if (Array.isArray(rep._failures)) {
    for (const failure of rep._failures) {
      if (failure.detail && failure.detail.toLowerCase().includes("blocker")) {
        verdict = "BLOCKED";
        break;
      }
    }
  }

  const report = {
    timestamp,
    commit: rep._commit,
    summary: {
      total: rep._summaries.total,
      passed: rep._summaries.passed,
      failed: rep._summaries.failed,
      skipped: rep._summaries.skipped,
      duration_ms: rep._summaries.duration_ms,
    },
    verdict,
    by_suite: rep._by_suite,
    failures: rep._failures,
  };

  // Generate JUnit XML
  const xml = generateJUnitXML(rep);

  return { json: report, xml };
}

/**
 * Generate JUnit XML format from reporter
 * @param {Object} rep Reporter instance
 * @returns {string} JUnit XML string
 */
function generateJUnitXML(rep) {
  if (rep._summaries.total === 0) {
    return "";
  }

  let xml = "";
  xml += "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
  xml += "<testsuites>\n";

  // Generate testsuite elements for each suite
  for (const [suiteName, suiteData] of Object.entries(rep._by_suite)) {
    xml += `  <testsuite name=\"${suiteName}\" tests=\"${suiteData.total}\" failures=\"${suiteData.failed}\" errors=\"0\" skipped=\"${suiteData.skipped}\" time=\"${(suiteData.duration_ms / 1000).toFixed(3)}">\n`;

    // Get failures for this suite
    const suiteFailures = rep._failures.filter((f) => f.suite === suiteName);

    for (let i = 0; i < suiteData.total; i++) {
      const isFailure = i < suiteData.passed + suiteData.failed && i >= suiteData.passed;
      const isPassed = i < suiteData.passed;

      let testCaseStatus = "";
      let testCaseContent = "";

      if (isFailure && suiteFailures.length > 0) {
        const failure = suiteFailures.find((_, idx) => idx === i - suiteData.passed);
        if (failure) {
          testCaseStatus = `    <failure message=\"Expected ${failure.expected}, got ${failure.actual}\">${failure.detail}</failure>\n`;
        }
      }

      testCaseContent += `    <testcase name=\"Test ${i + 1}\" time=\"${(suiteData.duration_ms / 1000 / suiteData.total).toFixed(3)}\">`;

      if (testCaseStatus) {
        testCaseContent += testCaseStatus;
      }

      testCaseContent += "    </testcase>\n";
      xml += testCaseContent;
    }

    xml += "  </testsuite>\n";
  }

  xml += "</testsuites>";
  return xml;
}

/**
 * Write the report to disk
 * @param {Object} rep Reporter instance
 * @param {string} outputDir Output directory path
 * @returns {Object} Path to written files
 */
export function writeReport(rep, outputDir) {
  if (rep._summaries.total === 0) {
    throw new Error("Cannot write report: no suites added");
  }

  const reportDir = outputDir;

  // Ensure output directory exists
  if (!existsSync(reportDir)) {
    mkdirSync(reportDir, { recursive: true });
  }

  // Generate report
  const { json, xml } = generateReport(rep);

  // Write JSON report
  const jsonPath = join(reportDir, "qa-report.json");
  writeFileSync(jsonPath, JSON.stringify(json, null, 2), "utf-8");

  // Write XML report
  const xmlPath = join(reportDir, "qa-report.xml");
  writeFileSync(xmlPath, xml, "utf-8");

  return {
    jsonPath,
    xmlPath,
  };
}