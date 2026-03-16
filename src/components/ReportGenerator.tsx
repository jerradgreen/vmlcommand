import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/format";
import jsPDF from "jspdf";

interface ReportGeneratorProps {
  metrics: Record<string, any>;
  cashMetrics?: Record<string, any> | null;
  dateLabel: string;
}

interface ReportData {
  quickBullets: string[];
  detailedSummary: string;
  actionItems: { title: string; description: string; priority: string }[];
  healthScore: string;
}

export default function ReportGenerator({ metrics, cashMetrics, dateLabel }: ReportGeneratorProps) {
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const metricsPayload = {
        ...metrics,
        cashInBank: cashMetrics?.cashInBank,
        netCashPosition: cashMetrics?.netCashPosition,
      };

      const { data, error } = await supabase.functions.invoke("generate-report", {
        body: { metrics: metricsPayload, dateLabel },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      buildPDF(data as ReportData, metricsPayload);
      toast.success("Report downloaded!");
    } catch (e: any) {
      console.error("Report generation failed:", e);
      toast.error(e.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const buildPDF = (report: ReportData, m: Record<string, any>) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 50;
    const contentW = pageW - margin * 2;
    let y = margin;

    const addText = (text: string, size: number, style: string = "normal", color: [number, number, number] = [30, 30, 30]) => {
      doc.setFontSize(size);
      doc.setFont("helvetica", style);
      doc.setTextColor(...color);
    };

    const checkPage = (needed: number) => {
      if (y + needed > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
    };

    // ── Header ──
    addText("", 22, "bold", [20, 20, 20]);
    doc.text("VML Command — Business Health Report", margin, y);
    y += 24;
    addText("", 11, "normal", [100, 100, 100]);
    doc.text(`Period: ${dateLabel}  •  Generated: ${new Date().toLocaleDateString()}`, margin, y);
    y += 10;

    // Health badge
    const healthLabels: Record<string, string> = {
      critical: "⚠ CRITICAL", needs_attention: "⚡ NEEDS ATTENTION",
      healthy: "✓ HEALTHY", strong: "★ STRONG",
    };
    const healthColors: Record<string, [number, number, number]> = {
      critical: [220, 38, 38], needs_attention: [234, 179, 8],
      healthy: [22, 163, 74], strong: [5, 150, 105],
    };
    y += 8;
    addText("", 12, "bold", healthColors[report.healthScore] ?? [100, 100, 100]);
    doc.text(`Overall Health: ${healthLabels[report.healthScore] ?? report.healthScore}`, margin, y);
    y += 24;

    // ── Divider ──
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageW - margin, y);
    y += 20;

    // ── KPI Table ──
    addText("", 14, "bold");
    doc.text("Key Performance Indicators", margin, y);
    y += 18;

    const kpis: [string, string][] = [
      ["Sales Revenue", formatCurrency(m.salesRevenue ?? m.rangeRevenue ?? 0)],
      ["Bank Deposits (Cash)", formatCurrency(m.depositRevenue ?? 0)],
      ["Total Sales", formatNumber(m.totalSales ?? 0)],
      ["New-Lead Sales", formatNumber(m.newLeadSalesCount ?? 0)],
      ["Avg Order Value", formatCurrency(m.avgOrderValue ?? 0)],
      ["ROAS", `${(m.rangeRoas ?? 0).toFixed(2)}x`],
      ["New-Lead Close Rate", formatPercent(m.closeRate ?? 0)],
      ["Cost Per Lead", m.costPerLead != null ? formatCurrency(m.costPerLead) : "N/A"],
      ["Revenue Per Lead (New Leads)", m.revenuePerLead != null ? formatCurrency(m.revenuePerLead) : "N/A"],
      ["Cost Per New-Lead Sale", m.costPerSale != null ? formatCurrency(m.costPerSale) : "N/A"],
      ["COGS (Actual + Estimated)", formatCurrency(m.briefCogs ?? m.adjustedCogsTotal ?? 0)],
      ["Gross Profit (30d)", formatCurrency(m.grossProfit ?? 0)],
      ["Gross Margin", formatPercent(m.grossMargin ?? 0)],
      ["Ad Spend", formatCurrency(m.adsSpendTotal ?? 0)],
      ["Overhead", formatCurrency(m.overheadTotal ?? 0)],
      ["Shopify Capital Paid", formatCurrency(m.shopifyCapitalPaidInRange ?? 0)],
      ["Net Profit", formatCurrency(m.netProfit ?? 0)],
      ["Net Margin", formatPercent(m.netMargin ?? 0)],
    ];

    if (m.cashInBank != null) {
      kpis.push(["Cash in Bank", formatCurrency(m.cashInBank)]);
      kpis.push(["Net Cash Position", formatCurrency(m.netCashPosition ?? 0)]);
    }

    doc.setFontSize(9);
    // Table header
    doc.setFillColor(245, 245, 245);
    doc.rect(margin, y - 10, contentW, 16, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text("Metric", margin + 8, y);
    doc.text("Value", margin + contentW - 120, y);
    y += 14;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    for (const [label, value] of kpis) {
      checkPage(16);
      if (kpis.indexOf([label, value] as any) % 2 === 0) {
        // subtle stripe — skip for simplicity
      }
      doc.setFontSize(9);
      doc.text(label, margin + 8, y);
      doc.text(value, margin + contentW - 120, y);
      y += 14;
    }
    y += 8;

    // ── Profit Breakdown Bar ──
    checkPage(60);
    addText("", 11, "bold");
    doc.text("Profit Breakdown (% of Sales Revenue)", margin, y);
    y += 14;

    const rev = Math.max(m.salesRevenue ?? m.rangeRevenue ?? 1, 1);
    const cogsPct = (m.briefCogs ?? m.adjustedCogsTotal ?? 0) / rev;
    const adsPct = (m.adsSpendTotal ?? 0) / rev;
    const ohPct = (m.overheadTotal ?? 0) / rev;
    const capPct = (m.shopifyCapitalPaidInRange ?? 0) / rev;
    const netProfitPct = 1 - cogsPct - adsPct - ohPct - capPct;
    const barW = contentW - 40;
    const barH = 18;

    // Stacked segments — clamp each to available space
    let barX = margin;
    const segments = [
      { pct: cogsPct, color: [59, 130, 246] as [number, number, number] },   // blue
      { pct: adsPct, color: [239, 68, 68] as [number, number, number] },     // red
      { pct: ohPct, color: [234, 179, 8] as [number, number, number] },      // yellow
      { pct: capPct, color: [168, 85, 247] as [number, number, number] },    // purple
      { pct: Math.max(netProfitPct, 0), color: [22, 163, 74] as [number, number, number] }, // green (clamped)
    ];
    for (const seg of segments) {
      const w = barW * Math.max(Math.min(seg.pct, 1), 0);
      if (w > 0) {
        doc.setFillColor(seg.color[0], seg.color[1], seg.color[2]);
        doc.rect(barX, y, w, barH, "F");
        barX += w;
      }
    }
    y += barH + 8;

    // Legend — show true percentages including negative net profit
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    const legendItems = [
      { label: `COGS ${(cogsPct * 100).toFixed(0)}%`, color: [59, 130, 246] },
      { label: `Ads ${(adsPct * 100).toFixed(0)}%`, color: [239, 68, 68] },
      { label: `Overhead ${(ohPct * 100).toFixed(0)}%`, color: [234, 179, 8] },
      { label: `Capital ${(capPct * 100).toFixed(0)}%`, color: [168, 85, 247] },
      { label: `Net Profit ${(netProfitPct * 100).toFixed(0)}%`, color: [22, 163, 74] },
    ];
    let lx = margin;
    for (const item of legendItems) {
      doc.setFillColor(item.color[0], item.color[1], item.color[2]);
      doc.rect(lx, y, 8, 8, "F");
      doc.text(item.label, lx + 12, y + 7);
      lx += 90;
    }
    y += 22;

    // ── Quick Summary Bullets ──
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageW - margin, y);
    y += 16;
    addText("", 14, "bold");
    doc.text("Quick Summary", margin, y);
    y += 16;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    for (const bullet of report.quickBullets) {
      checkPage(30);
      const lines = doc.splitTextToSize(`•  ${bullet}`, contentW - 16);
      doc.text(lines, margin + 8, y);
      y += lines.length * 12 + 4;
    }
    y += 8;

    // ── PAGE 2: Detailed Analysis ──
    doc.addPage();
    y = margin;

    addText("", 14, "bold");
    doc.text("Detailed Analysis", margin, y);
    y += 18;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    const detailLines = doc.splitTextToSize(report.detailedSummary, contentW);
    for (let i = 0; i < detailLines.length; i++) {
      checkPage(14);
      doc.text(detailLines[i], margin, y);
      y += 13;
    }
    y += 16;

    // ── Action Items ──
    checkPage(40);
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageW - margin, y);
    y += 16;
    addText("", 14, "bold");
    doc.text("Action Items & Recommendations", margin, y);
    y += 18;

    const priorityColors: Record<string, [number, number, number]> = {
      high: [220, 38, 38], medium: [234, 179, 8], low: [100, 100, 100],
    };

    for (let i = 0; i < report.actionItems.length; i++) {
      const item = report.actionItems[i];
      checkPage(40);

      // Priority badge
      const pc = priorityColors[item.priority] ?? [100, 100, 100];
      doc.setFontSize(8);
      doc.setTextColor(...pc);
      doc.setFont("helvetica", "bold");
      doc.text(`[${item.priority.toUpperCase()}]`, margin + 8, y);

      // Title
      doc.setFontSize(10);
      doc.setTextColor(30, 30, 30);
      doc.text(item.title, margin + 60, y);
      y += 14;

      // Description
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(70, 70, 70);
      const descLines = doc.splitTextToSize(item.description, contentW - 68);
      doc.text(descLines, margin + 60, y);
      y += descLines.length * 12 + 10;
    }

    // ── Footer ──
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      doc.text(
        `VML Command  •  Page ${p} of ${totalPages}  •  Generated ${new Date().toLocaleString()}`,
        margin,
        doc.internal.pageSize.getHeight() - 20,
      );
    }

    doc.save(`VML-Report-${dateLabel.replace(/[^a-zA-Z0-9]/g, "-")}.pdf`);
  };

  return (
    <Button variant="outline" size="sm" onClick={generate} disabled={loading} className="gap-1.5">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {loading ? "Generating…" : "Download Report"}
    </Button>
  );
}
