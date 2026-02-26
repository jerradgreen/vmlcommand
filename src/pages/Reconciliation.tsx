import { useReconciliation } from "@/hooks/useReconciliation";
import { formatCurrency, formatPercent } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Reconciliation() {
  const { data, isLoading } = useReconciliation();

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading reconciliation data…</div>;
  if (!data) return <div className="p-8 text-muted-foreground">No data available.</div>;

  const { months, totalDeposits, totalSales, totalGap } = data;
  const hasMissing = totalGap > 500;
  const coveragePct = totalDeposits > 0 ? totalSales / totalDeposits : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Revenue Reconciliation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compares bank deposits (customer payments &amp; platform payouts) against recorded sales.
            If deposits exceed sales, you likely have orders missing from your sales sheet.
          </p>
        </div>
        <Badge variant={coveragePct >= 0.95 ? "default" : coveragePct >= 0.7 ? "secondary" : "destructive"} className="text-sm px-3 py-1">
          Sales Coverage: {formatPercent(coveragePct)}
        </Badge>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bank Deposits</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalDeposits)}</p>
            <p className="text-xs text-muted-foreground mt-1">Source of truth</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recorded Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalSales)}</p>
            <p className="text-xs text-muted-foreground mt-1">From sales sheet</p>
          </CardContent>
        </Card>
        <Card className={cn(hasMissing && "border-destructive")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              {hasMissing ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-green-600" />}
              Missing Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-bold", hasMissing ? "text-destructive" : "text-green-600")}>
              {formatCurrency(Math.abs(totalGap))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {hasMissing ? "Deposits exceed recorded sales" : "Sales match deposits"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Bank Deposits</TableHead>
                <TableHead className="text-right">Recorded Sales</TableHead>
                <TableHead className="text-right">Gap</TableHead>
                <TableHead className="text-right">Cumulative Gap</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((row) => {
                const isRed = row.gap > 500;
                const label = row.month.length === 7
                  ? new Date(row.month + "-01").toLocaleDateString("en-US", { year: "numeric", month: "short" })
                  : row.month;
                return (
                  <TableRow key={row.month} className={cn(isRed && "bg-destructive/5")}>
                    <TableCell className="font-medium">{label}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.deposits)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.salesRevenue)}</TableCell>
                    <TableCell className={cn("text-right font-medium", isRed ? "text-destructive" : "text-green-600")}>
                      {row.gap > 0 ? "+" : ""}{formatCurrency(row.gap)}
                    </TableCell>
                    <TableCell className={cn("text-right", row.cumulativeGap > 500 ? "text-destructive" : "text-green-600")}>
                      {row.cumulativeGap > 0 ? "+" : ""}{formatCurrency(row.cumulativeGap)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {/* Totals row */}
              <TableRow className="font-bold border-t-2">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{formatCurrency(totalDeposits)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totalSales)}</TableCell>
                <TableCell className={cn("text-right", totalGap > 500 ? "text-destructive" : "text-green-600")}>
                  {totalGap > 0 ? "+" : ""}{formatCurrency(totalGap)}
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
