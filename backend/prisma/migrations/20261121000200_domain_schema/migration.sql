-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WEB', 'PHONE', 'WHATSAPP', 'OTHER');

-- CreateEnum
CREATE TYPE "SystemType" AS ENUM ('ON_GRID', 'OFF_GRID', 'PANEL_SET');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'SURVEY_SCHEDULED', 'SURVEY_PENDING_APPROVAL', 'SURVEY_APPROVED', 'QUOTED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CALL', 'NOTE', 'STATUS_CHANGE', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "SurveyStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('PANEL', 'INVERTER', 'BATTERY', 'CONTROLLER', 'STAND', 'WIRING', 'SWITCH', 'SAFETY', 'OTHER');

-- CreateEnum
CREATE TYPE "PackageType" AS ENUM ('PANEL_SET', 'ON_GRID', 'OFF_GRID', 'INSTALLATION');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LineKind" AS ENUM ('MATERIAL', 'SERVICE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CONFIRMED', 'AWAITING_STOCK', 'READY_TO_DISPATCH', 'DISPATCHED', 'DELIVERED', 'INSTALLATION_IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'RESERVE', 'RELEASE', 'DISPATCH', 'RETURN', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('IN_STOCK', 'RESERVED', 'DISPATCHED', 'DELIVERED', 'INSTALLED', 'UNDER_REPAIR', 'REPLACED');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('DRAFT', 'ALLOCATED', 'DISPATCHED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DispatchItemStatus" AS ENUM ('ALLOCATED', 'DISPATCHED', 'DELIVERED', 'RETURNED');

-- CreateEnum
CREATE TYPE "WarrantyStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'VOID', 'REPLACED');

-- CreateEnum
CREATE TYPE "InstallationStatus" AS ENUM ('UNSCHEDULED', 'SCHEDULED', 'IN_PROGRESS', 'PENDING_SIGNOFF', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AttachmentOwnerType" AS ENUM ('SURVEY', 'INSTALLATION', 'TICKET', 'SUBSIDY');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED_PENDING_CONFIRMATION', 'CLOSED');

-- CreateEnum
CREATE TYPE "CoverageDecision" AS ENUM ('PENDING', 'COVERED', 'NOT_COVERED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "SubsidyStatus" AS ENUM ('NOT_STARTED', 'DOCUMENTS_PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "JobCostCategory" AS ENUM ('TRANSPORT', 'LABOR', 'MATERIAL', 'OTHER');

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "leadNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "source" "LeadSource" NOT NULL,
    "desiredKw" DECIMAL(10,2),
    "systemType" "SystemType",
    "subsidyInterest" BOOLEAN NOT NULL,
    "roofArea" DECIMAL(10,2),
    "monthlyBill" DECIMAL(12,2),
    "gridSuitable" BOOLEAN,
    "status" "LeadStatus" NOT NULL,
    "assignedToId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "ActivityType" NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSurvey" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "surveyorId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "visitedAt" TIMESTAMP(3),
    "roofDirection" TEXT,
    "tiltDegrees" DECIMAL(10,2),
    "cableDistanceMeters" DECIMAL(10,2),
    "shadowFreeArea" DECIMAL(10,2),
    "gridSuitable" BOOLEAN,
    "findings" TEXT,
    "status" "SurveyStatus" NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "unit" TEXT NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL,
    "salePrice" DECIMAL(12,2) NOT NULL,
    "serialized" BOOLEAN NOT NULL,
    "warrantyMonths" INTEGER NOT NULL,
    "reorderLevel" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolarPackage" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PackageType" NOT NULL,
    "capacityKw" DECIMAL(10,2),
    "basePrice" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolarPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageComponent" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationLine" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "productId" TEXT,
    "descriptionSnapshot" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceSnapshot" DECIMAL(12,2) NOT NULL,
    "unitCostSnapshot" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "lineKind" "LineKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "descriptionSnapshot" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceSnapshot" DECIMAL(12,2) NOT NULL,
    "unitCostSnapshot" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "lineKind" "LineKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "recordedById" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBalance" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "onHand" INTEGER NOT NULL,
    "reserved" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderId" TEXT,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2),
    "actorId" TEXT,
    "reason" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerializedAsset" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "status" "AssetStatus" NOT NULL,
    "orderId" TEXT,
    "customerId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "replacedAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SerializedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispatch" (
    "id" TEXT NOT NULL,
    "dispatchNumber" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "DispatchStatus" NOT NULL,
    "preparedById" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "recipientName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchItem" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "assetId" TEXT,
    "quantity" INTEGER NOT NULL,
    "status" "DispatchItemStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DispatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warranty" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "months" INTEGER NOT NULL,
    "status" "WarrantyStatus" NOT NULL,
    "originalWarrantyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warranty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "capacityKw" DECIMAL(10,2) NOT NULL,
    "status" "InstallationStatus" NOT NULL,
    "checklist" JSONB NOT NULL,
    "generationTestPassed" BOOLEAN,
    "generationReading" DECIMAL(10,2),
    "customerSignerName" TEXT,
    "signatureAttachmentId" TEXT,
    "signedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Installation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationAssignment" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL,
    "assignmentRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallationAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkLog" (
    "id" TEXT NOT NULL,
    "installationId" TEXT,
    "ticketId" TEXT,
    "technicianId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "hourlyCostSnapshot" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "ownerType" "AttachmentOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTicket" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "assetId" TEXT,
    "orderId" TEXT,
    "assignedToId" TEXT,
    "faultCode" TEXT,
    "description" TEXT NOT NULL,
    "priority" "TicketPriority" NOT NULL,
    "status" "TicketStatus" NOT NULL,
    "coverageDecision" "CoverageDecision" NOT NULL,
    "coverageReason" TEXT,
    "incidentAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "customerConfirmationName" TEXT,
    "laborCharge" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketPart" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "costSnapshot" DECIMAL(12,2) NOT NULL,
    "chargeSnapshot" DECIMAL(12,2) NOT NULL,
    "replacementAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "orderId" TEXT,
    "ticketId" TEXT,
    "customerId" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubsidyApplication" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "SubsidyStatus" NOT NULL,
    "reference" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decisionAt" TIMESTAMP(3),
    "notes" TEXT,
    "documentChecklist" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubsidyApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCost" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "category" "JobCostCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "recordedById" TEXT NOT NULL,
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_leadNumber_key" ON "Lead"("leadNumber");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_customerId_idx" ON "Lead"("customerId");

-- CreateIndex
CREATE INDEX "Lead_assignedToId_idx" ON "Lead"("assignedToId");

-- CreateIndex
CREATE INDEX "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadActivity_actorId_idx" ON "LeadActivity"("actorId");

-- CreateIndex
CREATE INDEX "SiteSurvey_leadId_status_idx" ON "SiteSurvey"("leadId", "status");

-- CreateIndex
CREATE INDEX "SiteSurvey_surveyorId_scheduledAt_idx" ON "SiteSurvey"("surveyorId", "scheduledAt");

-- CreateIndex
CREATE INDEX "SiteSurvey_approvedById_idx" ON "SiteSurvey"("approvedById");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_category_isActive_idx" ON "Product"("category", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SolarPackage_code_key" ON "SolarPackage"("code");

-- CreateIndex
CREATE INDEX "SolarPackage_isActive_idx" ON "SolarPackage"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SolarPackage_type_capacityKw_key" ON "SolarPackage"("type", "capacityKw");

-- CreateIndex
CREATE INDEX "PackageComponent_productId_idx" ON "PackageComponent"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PackageComponent_packageId_productId_key" ON "PackageComponent"("packageId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_quoteNumber_key" ON "Quotation"("quoteNumber");

-- CreateIndex
CREATE INDEX "Quotation_leadId_status_idx" ON "Quotation"("leadId", "status");

-- CreateIndex
CREATE INDEX "Quotation_surveyId_idx" ON "Quotation"("surveyId");

-- CreateIndex
CREATE INDEX "Quotation_packageId_idx" ON "Quotation"("packageId");

-- CreateIndex
CREATE INDEX "Quotation_createdById_idx" ON "Quotation"("createdById");

-- CreateIndex
CREATE INDEX "QuotationLine_quotationId_idx" ON "QuotationLine"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationLine_productId_idx" ON "QuotationLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_quotationId_key" ON "Order"("quotationId");

-- CreateIndex
CREATE INDEX "Order_customerId_status_confirmedAt_idx" ON "Order"("customerId", "status", "confirmedAt");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "OrderLine_productId_idx" ON "OrderLine"("productId");

-- CreateIndex
CREATE INDEX "Payment_orderId_receivedAt_idx" ON "Payment"("orderId", "receivedAt");

-- CreateIndex
CREATE INDEX "Payment_recordedById_idx" ON "Payment"("recordedById");

-- CreateIndex
CREATE UNIQUE INDEX "StockBalance_productId_key" ON "StockBalance"("productId");

-- CreateIndex
CREATE INDEX "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_orderId_idx" ON "StockMovement"("orderId");

-- CreateIndex
CREATE INDEX "StockMovement_actorId_idx" ON "StockMovement"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "SerializedAsset_serialNumber_key" ON "SerializedAsset"("serialNumber");

-- CreateIndex
CREATE INDEX "SerializedAsset_productId_status_idx" ON "SerializedAsset"("productId", "status");

-- CreateIndex
CREATE INDEX "SerializedAsset_orderId_idx" ON "SerializedAsset"("orderId");

-- CreateIndex
CREATE INDEX "SerializedAsset_customerId_idx" ON "SerializedAsset"("customerId");

-- CreateIndex
CREATE INDEX "SerializedAsset_replacedAssetId_idx" ON "SerializedAsset"("replacedAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_dispatchNumber_key" ON "Dispatch"("dispatchNumber");

-- CreateIndex
CREATE INDEX "Dispatch_orderId_status_idx" ON "Dispatch"("orderId", "status");

-- CreateIndex
CREATE INDEX "Dispatch_preparedById_idx" ON "Dispatch"("preparedById");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchItem_assetId_key" ON "DispatchItem"("assetId");

-- CreateIndex
CREATE INDEX "DispatchItem_dispatchId_productId_idx" ON "DispatchItem"("dispatchId", "productId");

-- CreateIndex
CREATE INDEX "DispatchItem_productId_idx" ON "DispatchItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Warranty_assetId_key" ON "Warranty"("assetId");

-- CreateIndex
CREATE INDEX "Warranty_customerId_endAt_idx" ON "Warranty"("customerId", "endAt");

-- CreateIndex
CREATE INDEX "Warranty_orderId_idx" ON "Warranty"("orderId");

-- CreateIndex
CREATE INDEX "Warranty_originalWarrantyId_idx" ON "Warranty"("originalWarrantyId");

-- CreateIndex
CREATE UNIQUE INDEX "Installation_orderId_key" ON "Installation"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Installation_signatureAttachmentId_key" ON "Installation"("signatureAttachmentId");

-- CreateIndex
CREATE INDEX "Installation_status_scheduledAt_idx" ON "Installation"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "InstallationAssignment_technicianId_assignedAt_idx" ON "InstallationAssignment"("technicianId", "assignedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstallationAssignment_installationId_technicianId_key" ON "InstallationAssignment"("installationId", "technicianId");

-- CreateIndex
CREATE INDEX "WorkLog_technicianId_startAt_idx" ON "WorkLog"("technicianId", "startAt");

-- CreateIndex
CREATE INDEX "WorkLog_installationId_idx" ON "WorkLog"("installationId");

-- CreateIndex
CREATE INDEX "WorkLog_ticketId_idx" ON "WorkLog"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE INDEX "Attachment_ownerType_ownerId_idx" ON "Attachment"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "Attachment_uploadedById_idx" ON "Attachment"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceTicket_ticketNumber_key" ON "ServiceTicket"("ticketNumber");

-- CreateIndex
CREATE INDEX "ServiceTicket_status_priority_idx" ON "ServiceTicket"("status", "priority");

-- CreateIndex
CREATE INDEX "ServiceTicket_customerId_idx" ON "ServiceTicket"("customerId");

-- CreateIndex
CREATE INDEX "ServiceTicket_assetId_idx" ON "ServiceTicket"("assetId");

-- CreateIndex
CREATE INDEX "ServiceTicket_orderId_idx" ON "ServiceTicket"("orderId");

-- CreateIndex
CREATE INDEX "ServiceTicket_assignedToId_idx" ON "ServiceTicket"("assignedToId");

-- CreateIndex
CREATE INDEX "TicketPart_ticketId_idx" ON "TicketPart"("ticketId");

-- CreateIndex
CREATE INDEX "TicketPart_productId_idx" ON "TicketPart"("productId");

-- CreateIndex
CREATE INDEX "TicketPart_replacementAssetId_idx" ON "TicketPart"("replacementAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_ticketId_key" ON "Invoice"("ticketId");

-- CreateIndex
CREATE INDEX "Invoice_customerId_status_idx" ON "Invoice"("customerId", "status");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "SubsidyApplication_orderId_key" ON "SubsidyApplication"("orderId");

-- CreateIndex
CREATE INDEX "SubsidyApplication_status_idx" ON "SubsidyApplication"("status");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "JobCost_orderId_incurredAt_idx" ON "JobCost"("orderId", "incurredAt");

-- CreateIndex
CREATE INDEX "JobCost_recordedById_idx" ON "JobCost"("recordedById");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteSurvey" ADD CONSTRAINT "SiteSurvey_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteSurvey" ADD CONSTRAINT "SiteSurvey_surveyorId_fkey" FOREIGN KEY ("surveyorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteSurvey" ADD CONSTRAINT "SiteSurvey_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageComponent" ADD CONSTRAINT "PackageComponent_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SolarPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageComponent" ADD CONSTRAINT "PackageComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "SiteSurvey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SolarPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerializedAsset" ADD CONSTRAINT "SerializedAsset_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerializedAsset" ADD CONSTRAINT "SerializedAsset_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerializedAsset" ADD CONSTRAINT "SerializedAsset_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerializedAsset" ADD CONSTRAINT "SerializedAsset_replacedAssetId_fkey" FOREIGN KEY ("replacedAssetId") REFERENCES "SerializedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "SerializedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "SerializedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_originalWarrantyId_fkey" FOREIGN KEY ("originalWarrantyId") REFERENCES "Warranty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_signatureAttachmentId_fkey" FOREIGN KEY ("signatureAttachmentId") REFERENCES "Attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationAssignment" ADD CONSTRAINT "InstallationAssignment_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationAssignment" ADD CONSTRAINT "InstallationAssignment_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ServiceTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "SerializedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPart" ADD CONSTRAINT "TicketPart_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ServiceTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPart" ADD CONSTRAINT "TicketPart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPart" ADD CONSTRAINT "TicketPart_replacementAssetId_fkey" FOREIGN KEY ("replacementAssetId") REFERENCES "SerializedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ServiceTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubsidyApplication" ADD CONSTRAINT "SubsidyApplication_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCost" ADD CONSTRAINT "JobCost_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCost" ADD CONSTRAINT "JobCost_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enforce invariants even when records are written outside the API.
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_valid_counts"
  CHECK ("reserved" >= 0 AND "onHand" >= "reserved");
ALTER TABLE "PackageComponent" ADD CONSTRAINT "PackageComponent_positive_quantity"
  CHECK ("quantity" > 0);
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_valid_quantity"
  CHECK ("quantity" > 0 AND ("assetId" IS NULL OR "quantity" = 1));
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_positive_amount"
  CHECK ("amount" > 0);
ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_valid_period"
  CHECK ("months" > 0 AND "endAt" > "startAt");
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_valid_period_and_parent"
  CHECK ("endAt" > "startAt" AND num_nonnulls("installationId", "ticketId") = 1);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_one_source"
  CHECK (num_nonnulls("orderId", "ticketId") = 1);
