import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Check, Copy, ChevronDown } from "lucide-react";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const BASE = `https://${PROJECT_ID}.supabase.co/functions/v1`;

const LEAD_URL = `${BASE}/ingest-lead`;
const SALE_URL = `${BASE}/ingest-sale`;

const LEAD_SAMPLE = JSON.stringify(
  {
    external_id: "12345",
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "555-123-4567",
    phrase: "LOVE",
    sign_style: "Marquee Letters",
    size_text: "24 inch",
    budget_text: "$500-$1000",
    notes: "For wedding reception",
    submitted_at: "2025-06-15T10:30:00Z",
  },
  null,
  2
);

const SALE_SAMPLE = JSON.stringify(
  {
    external_id: "ORD-9876",
    order_id: "ORD-9876",
    date: "2025-06-20",
    email: "jane@example.com",
    product_name: "LOVE Marquee Sign 24in",
    revenue: 749.99,
    order_text: "Custom marquee letters",
  },
  null,
  2
);

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="outline" size="sm" onClick={copy} className="shrink-0">
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function EndpointCard({
  title,
  description,
  url,
  sample,
}: {
  title: string;
  description: string;
  url: string;
  sample: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Webhook URL (POST)</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm bg-muted rounded px-3 py-2 break-all">{url}</code>
            <CopyButton text={url} />
          </div>
        </div>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 px-0 text-muted-foreground">
              <ChevronDown className="h-4 w-4" />
              Sample JSON payload
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="relative mt-2">
              <pre className="text-xs bg-muted rounded p-3 overflow-x-auto">{sample}</pre>
              <div className="absolute top-2 right-2">
                <CopyButton text={sample} />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Webhook endpoints for Zapier integration</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <EndpointCard
          title="Ingest Lead"
          description="POST Cognito form submissions here. Requires external_id."
          url={LEAD_URL}
          sample={LEAD_SAMPLE}
        />
        <EndpointCard
          title="Ingest Sale"
          description="POST Google Sheets rows here. Requires external_id. Auto-triggers matching."
          url={SALE_URL}
          sample={SALE_SAMPLE}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Debugging</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Every ingestion attempt is logged in the <code className="text-xs bg-muted px-1 py-0.5 rounded">ingestion_logs</code> table
            with status <code className="text-xs bg-muted px-1 py-0.5 rounded">ok</code> or <code className="text-xs bg-muted px-1 py-0.5 rounded">error</code>.
            If Zapier reports success but data doesn't appear, check this table for error details.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
