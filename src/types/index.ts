export type StageStatus =
  | "needs_review"
  | "counteroffer_sent"
  | "ready_to_invoice"
  | "completed"
  | "draft"
  | "awaiting_counterparty"
  | "paid"
  | "overdue"
  | "sent";

export type PriorityLevel = "critical" | "high" | "medium" | "low";

export type TermMatchStatus = "matched" | "conflict" | "needs_confirmation";

export interface TransactionRecord {
  id: string;
  agreementId: string;
  buyer: string;
  poNumber: string;
  value: number;
  stage: StageStatus;
  stageLabel: string;
  updated: string;
  supplier: string;
  date: string;
}

export interface AttentionItem {
  id: string;
  poNumber: string;
  title: string;
  buyerName: string;
  referenceNumber: string;
  amount: number;
  lastUpdated: string;
  priority: PriorityLevel;
  agreementId: string;
  reason: string;
}

export interface CommercialTerm {
  id: string;
  termName: string;
  contractRequirement: string;
  buyerRequest: string;
  status: TermMatchStatus;
  clauseRef?: string;
  notes?: string;
}

export interface SourceDocument {
  id: string;
  name: string;
  fileType: "PDF" | "DOCX" | "XLSX";
  lastUpdated: string;
  version: string;
  verificationState: "verified" | "pending" | "unverified";
  size: string;
  clausesCount: number;
  content: {
    title: string;
    sections: {
      heading: string;
      clauseRef: string;
      body: string;
      isHighlighted?: boolean;
    }[];
  };
}

export interface PurchaseOrderRecord {
  id: string;
  poNumber: string;
  buyer: string;
  supplier: string;
  amount: number;
  receivedDate: string;
  processingState: StageStatus;
  processingStateLabel: string;
  linkedAgreement: string;
  lineItemsCount: number;
}

export interface CounterofferRecord {
  id: string;
  agreementId: string;
  buyer: string;
  poNumber: string;
  originalRequestedTerms: string;
  proposedTerms: string;
  currentStatus: "Under review" | "Pending buyer acceptance" | "Accepted" | "Rejected";
  lastResponse: string;
  diffSummary: string;
  deltaValue: string;
  notes: string;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  buyer: string;
  poReference: string;
  agreementId: string;
  amount: number;
  paymentTerms: string;
  dueDate: string;
  status: "draft" | "sent" | "paid" | "overdue";
  paypalTrackingId?: string;
}

export interface ActivityEvent {
  id: string;
  timestamp: string;
  actor: string;
  relatedAgreement: string;
  action: string;
  eventDescription: string;
  category: "agreements" | "negotiations" | "invoices" | "payments";
}
