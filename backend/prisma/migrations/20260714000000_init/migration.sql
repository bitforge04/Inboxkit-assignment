-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "cellsOwned" INTEGER NOT NULL DEFAULT 0,
    "lastClaimAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cells" (
    "id" INTEGER NOT NULL,
    "ownerId" TEXT,
    "color" TEXT,
    "claimedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cells_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "cells" ADD CONSTRAINT "cells_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
