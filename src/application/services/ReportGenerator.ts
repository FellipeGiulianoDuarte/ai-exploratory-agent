import * as fs from 'fs/promises';
import * as path from 'path';
import { Finding, FindingType, FindingSeverity } from '../../domain/exploration/Finding';
import { ExplorationHistoryEntry } from '../ports/LLMPort';

/**
 * Statistics about the exploration session.
 */
export interface ExplorationStats {
  sessionId: string;
  targetUrl: string;
  objective: string;
  totalSteps: number;
  duration: number;
  stoppedReason: string;
  pagesVisited: string[];
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Report configuration options.
 */
export interface ReportConfig {
  outputDir: string;
  includeScreenshots: boolean;
  screenshotsDir: string;
}

const DEFAULT_CONFIG: ReportConfig = {
  outputDir: './reports',
  includeScreenshots: true,
  screenshotsDir: './screenshots',
};

/**
 * ReportGenerator creates comprehensive markdown reports from exploration sessions.
 */
export class ReportGenerator {
  private config: ReportConfig;

  constructor(config: Partial<ReportConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a complete exploration report.
   */
  async generateReport(
    stats: ExplorationStats,
    findings: Finding[],
    history: ExplorationHistoryEntry[],
    summary: string
  ): Promise<string> {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${timestamp}-${stats.sessionId.substring(0, 8)}-report.md`;
    const filePath = path.join(this.config.outputDir, filename);

    // Ensure output directory exists
    await fs.mkdir(this.config.outputDir, { recursive: true });

    // Generate report content
    const content = this.buildReportContent(stats, findings, history, summary);

    // Write report file
    await fs.writeFile(filePath, content, 'utf-8');

    return filePath;
  }

  /**
   * Build the complete report content.
   */
  private buildReportContent(
    stats: ExplorationStats,
    findings: Finding[],
    history: ExplorationHistoryEntry[],
    summary: string
  ): string {
    const sections = [
      this.buildHeader(stats),
      this.buildExecutiveSummary(stats, findings),
      this.buildAISummary(summary),
      this.buildFindingsSection(findings),
      this.buildCoverageSection(stats, history),
      this.buildMethodologySection(stats, history),
      this.buildTokenUsageSection(stats),
      this.buildAppendix(history),
    ];

    return sections.join('\n\n');
  }

  /**
   * Build report header.
   */
  private buildHeader(stats: ExplorationStats): string {
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return `# Exploration Report

**Target:** ${stats.targetUrl}  
**Date:** ${date}  
**Session ID:** \`${stats.sessionId}\`  
**Duration:** ${this.formatDuration(stats.duration)}

---`;
  }

  /**
   * Build executive summary section.
   */
  private buildExecutiveSummary(stats: ExplorationStats, findings: Finding[]): string {
    const bySeverity = this.groupBy(findings, f => f.severity);
    const byType = this.groupBy(findings, f => f.type);

    const criticalCount = bySeverity.get('critical')?.length || 0;
    const highCount = bySeverity.get('high')?.length || 0;
    const mediumCount = bySeverity.get('medium')?.length || 0;
    const lowCount = bySeverity.get('low')?.length || 0;

    return `## Executive Summary

### Key Metrics

| Metric | Value |
|--------|-------|
| Total Actions | ${stats.totalSteps} |
| Pages Visited | ${stats.pagesVisited.length} |
| Total Findings | ${findings.length} |
| Duration | ${this.formatDuration(stats.duration)} |
| Status | ${this.formatStatus(stats.stoppedReason)} |

### Findings by Severity

| Severity | Count | Percentage |
|----------|-------|------------|
| 🔴 Critical | ${criticalCount} | ${this.percentage(criticalCount, findings.length)} |
| 🟠 High | ${highCount} | ${this.percentage(highCount, findings.length)} |
| 🟡 Medium | ${mediumCount} | ${this.percentage(mediumCount, findings.length)} |
| 🟢 Low | ${lowCount} | ${this.percentage(lowCount, findings.length)} |

### Findings by Type

${Array.from(byType.entries())
  .sort((a, b) => b[1].length - a[1].length)
  .map(([type, items]) => `- **${this.formatType(type)}:** ${items.length}`)
  .join('\n')}`;
  }

  /**
   * Build AI-generated summary section.
   */
  private buildAISummary(summary: string): string {
    return `## AI Analysis Summary

${summary}`;
  }

  /**
   * Build findings section with detailed tables.
   */
  private buildFindingsSection(findings: Finding[]): string {
    if (findings.length === 0) {
      return `## Findings

No issues were found during the exploration.`;
    }

    const bySeverity = this.groupBy(findings, f => f.severity);
    const sections: string[] = ['## Findings'];

    // Critical findings
    if (bySeverity.has('critical')) {
      sections.push(this.buildFindingsTable('🔴 Critical Issues', bySeverity.get('critical')!));
    }

    // High findings
    if (bySeverity.has('high')) {
      sections.push(this.buildFindingsTable('🟠 High Severity Issues', bySeverity.get('high')!));
    }

    // Medium findings
    if (bySeverity.has('medium')) {
      sections.push(this.buildFindingsTable('🟡 Medium Severity Issues', bySeverity.get('medium')!));
    }

    // Low findings
    if (bySeverity.has('low')) {
      sections.push(this.buildFindingsTable('🟢 Low Severity Issues', bySeverity.get('low')!));
    }

    return sections.join('\n\n');
  }

  /**
   * Build a findings table for a severity level.
   */
  private buildFindingsTable(title: string, findings: Finding[]): string {
    const rows = findings.map((f, i) => {
      const shortTitle = f.title.length > 50 ? f.title.substring(0, 47) + '...' : f.title;
      const shortUrl = this.shortenUrl(f.pageUrl);
      return `| ${i + 1} | ${shortTitle} | ${this.formatType(f.type)} | [${shortUrl}](${f.pageUrl}) |`;
    });

    return `### ${title}

| # | Title | Type | Location |
|---|-------|------|----------|
${rows.join('\n')}

<details>
<summary>View Details (${findings.length} items)</summary>

${findings.map(f => this.buildFindingDetail(f)).join('\n\n---\n\n')}

</details>`;
  }

  /**
   * Build detailed view for a single finding.
   */
  private buildFindingDetail(finding: Finding): string {
    return `#### ${finding.title}

- **ID:** \`${finding.id}\`
- **Type:** ${this.formatType(finding.type)}
- **Severity:** ${this.formatSeverity(finding.severity)}
- **Page:** ${finding.pageUrl}
- **Step:** ${finding.stepNumber}
- **Discovered:** ${finding.discoveredAt.toISOString()}

**Description:**
${finding.description}

${finding.evidence.length > 0 ? `**Evidence:**\n${finding.evidence.map(e => `- ${e.description}: ${e.data}`).join('\n')}` : ''}`;
  }

  /**
   * Build coverage section.
   */
  private buildCoverageSection(stats: ExplorationStats, history: ExplorationHistoryEntry[]): string {
    // Analyze action types
    const actionTypes = this.countActionTypes(history);
    
    return `## Coverage Summary

### Pages Visited (${stats.pagesVisited.length})

${stats.pagesVisited.map(url => `- ${url}`).join('\n')}

### Actions Performed

| Action Type | Count | Percentage |
|-------------|-------|------------|
${Array.from(actionTypes.entries())
  .sort((a, b) => b[1] - a[1])
  .map(([type, count]) => `| ${type} | ${count} | ${this.percentage(count, history.length)} |`)
  .join('\n')}

### Areas Not Covered

Based on the exploration, the following areas may need additional testing:

${this.identifyUncoveredAreas(stats, history)}`;
  }

  /**
   * Build methodology section.
   */
  private buildMethodologySection(stats: ExplorationStats, history: ExplorationHistoryEntry[]): string {
    const successRate = history.filter(h => h.success).length / history.length * 100;
    const toolInvocations = history.filter(h => h.action.action === 'tool').length;

    return `## Methodology

### Exploration Strategy

- **Objective:** ${stats.objective}
- **Approach:** AI-driven autonomous exploration with human-in-the-loop checkpoints
- **Max Steps:** Configured maximum of steps with progress checkpoints
- **Tool Usage:** Custom tools for broken image detection and other inspections

### Execution Statistics

| Metric | Value |
|--------|-------|
| Total Actions Attempted | ${history.length} |
| Successful Actions | ${history.filter(h => h.success).length} |
| Failed Actions | ${history.filter(h => !h.success).length} |
| Success Rate | ${successRate.toFixed(1)}% |
| Tool Invocations | ${toolInvocations} |

### Testing Personas Used

The exploration utilized multiple testing personas:
- **Security Agent:** Focused on security vulnerabilities (XSS, injection, auth issues)
- **Monitor Agent:** Tracked console errors and performance issues
- **Validation Agent:** Verified form validation and error handling
- **Chaos Agent:** Tested edge cases and unexpected inputs
- **Edge Case Agent:** Explored boundary conditions and unusual scenarios`;
  }

  /**
   * Build token usage section.
   */
  private buildTokenUsageSection(stats: ExplorationStats): string {
    const { promptTokens, completionTokens, totalTokens } = stats.tokenUsage;
    
    // Estimate cost (approximate pricing for GPT-4o-mini)
    const promptCost = (promptTokens / 1_000_000) * 0.15;
    const completionCost = (completionTokens / 1_000_000) * 0.60;
    const totalCost = promptCost + completionCost;

    return `## Resource Usage

### Token Consumption

| Metric | Tokens | Estimated Cost |
|--------|--------|----------------|
| Prompt Tokens | ${promptTokens.toLocaleString()} | $${promptCost.toFixed(4)} |
| Completion Tokens | ${completionTokens.toLocaleString()} | $${completionCost.toFixed(4)} |
| **Total** | **${totalTokens.toLocaleString()}** | **$${totalCost.toFixed(4)}** |

*Cost estimates based on GPT-4o-mini pricing ($0.15/1M input, $0.60/1M output)*`;
  }

  /**
   * Build appendix with action history.
   */
  private buildAppendix(history: ExplorationHistoryEntry[]): string {
    const recentHistory = history.slice(-20); // Last 20 actions

    return `## Appendix

### Recent Action History (Last 20 Actions)

<details>
<summary>Click to expand</summary>

| Step | Action | Target | Result | URL |
|------|--------|--------|--------|-----|
${recentHistory.map(h => {
  const target = h.action.selector || h.action.value || h.action.toolName || '-';
  const shortTarget = target.length > 30 ? target.substring(0, 27) + '...' : target;
  const result = h.success ? '✅' : '❌';
  const shortUrl = this.shortenUrl(h.resultingUrl);
  return `| ${h.step} | ${h.action.action} | ${shortTarget} | ${result} | ${shortUrl} |`;
}).join('\n')}

</details>

---

*Report generated by AI Exploratory Agent*  
*https://github.com/FellipeGiulianoDuarte/ai-exploratory-agent*`;
  }

  // Helper methods

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  private formatStatus(reason: string): string {
    const statusMap: Record<string, string> = {
      'completed': '✅ Completed Successfully',
      'max_steps_reached': '⏹️ Max Steps Reached',
      'stopped_by_user': '🛑 Stopped by User',
      'error': '❌ Error',
    };
    return statusMap[reason] || reason;
  }

  private formatSeverity(severity: FindingSeverity): string {
    const severityMap: Record<FindingSeverity, string> = {
      'critical': '🔴 Critical',
      'high': '🟠 High',
      'medium': '🟡 Medium',
      'low': '🟢 Low',
    };
    return severityMap[severity];
  }

  private formatType(type: FindingType): string {
    const typeMap: Record<FindingType, string> = {
      'broken_image': 'Broken Image',
      'console_error': 'Console Error',
      'network_error': 'Network Error',
      'accessibility': 'Accessibility',
      'usability': 'Usability',
      'functional': 'Functional',
      'performance': 'Performance',
      'security': 'Security',
      'observed_bug': 'Bug',
      'text_issue': 'Text Issue',
      'ui_issue': 'UI Issue',
      'other': 'Other',
    };
    return typeMap[type] || type;
  }

  private percentage(count: number, total: number): string {
    if (total === 0) return '0%';
    return `${((count / total) * 100).toFixed(1)}%`;
  }

  private shortenUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.pathname || '/';
    } catch {
      return url.substring(0, 30);
    }
  }

  private groupBy<T, K>(array: T[], keyFn: (item: T) => K): Map<K, T[]> {
    const map = new Map<K, T[]>();
    for (const item of array) {
      const key = keyFn(item);
      const group = map.get(key) || [];
      group.push(item);
      map.set(key, group);
    }
    return map;
  }

  private countActionTypes(history: ExplorationHistoryEntry[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const entry of history) {
      const action = entry.action.action;
      counts.set(action, (counts.get(action) || 0) + 1);
    }
    return counts;
  }

  private identifyUncoveredAreas(stats: ExplorationStats, history: ExplorationHistoryEntry[]): string {
    const suggestions: string[] = [];
    
    // Check for common areas that might be missed
    const visitedPaths = stats.pagesVisited.map(url => {
      try {
        return new URL(url).pathname;
      } catch {
        return url;
      }
    });

    const commonPaths = ['/checkout', '/cart', '/profile', '/settings', '/admin', '/search', '/help', '/faq'];
    const missingPaths = commonPaths.filter(p => !visitedPaths.some(v => v.includes(p.slice(1))));
    
    if (missingPaths.length > 0) {
      suggestions.push(`- **Unvisited pages:** ${missingPaths.join(', ')}`);
    }

    // Check for action types that weren't used much
    const actionCounts = this.countActionTypes(history);
    if ((actionCounts.get('fill') || 0) < 3) {
      suggestions.push('- **Form testing:** Limited form input testing was performed');
    }
    if ((actionCounts.get('select') || 0) < 2) {
      suggestions.push('- **Dropdown testing:** Limited dropdown/select testing was performed');
    }

    if (suggestions.length === 0) {
      suggestions.push('- Exploration appears to have good coverage of available areas');
    }

    return suggestions.join('\n');
  }
}
