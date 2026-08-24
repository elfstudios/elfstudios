CREATE TABLE "CalendarBlock" (
  "id" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "slots" TEXT[] NOT NULL,
  "note" TEXT,
  "createdBy" TEXT NOT NULL,
  "googleCalendarEventId" TEXT,
  "googleCalendarSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CalendarBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarBlock_googleCalendarEventId_key" ON "CalendarBlock"("googleCalendarEventId");
CREATE INDEX "CalendarBlock_date_idx" ON "CalendarBlock"("date");
