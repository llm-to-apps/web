import { Prisma } from '@prisma/client'

import { prisma } from './db'

const llmMeterType = 'llm_tokens'
const million = new Prisma.Decimal(1_000_000)

export type BillAgentUsageInput = {
  actorUserId: string
  model: string
  projectId?: string | null
  requestId: string
  usage: {
    completionTokens?: number
    promptTokens?: number
    totalTokens?: number
  }
}

export async function billAgentUsage({
  actorUserId,
  model,
  projectId,
  requestId,
  usage
}: BillAgentUsageInput) {
  const promptTokens = usage.promptTokens ?? 0
  const completionTokens = usage.completionTokens ?? 0

  if (promptTokens <= 0 && completionTokens <= 0) {
    return null
  }

  const price = await findActiveUsagePrice({
    meterType: llmMeterType,
    model
  })

  if (!price) {
    console.warn('[Billing] Missing usage price; skipping agent debit', {
      meterType: llmMeterType,
      model,
      requestId
    })
    return null
  }

  const inputCredits = price.inputCredits ?? new Prisma.Decimal(0)
  const outputCredits = price.outputCredits ?? new Prisma.Decimal(0)
  const inputCostUsd = price.inputCostUsd ?? new Prisma.Decimal(0)
  const outputCostUsd = price.outputCostUsd ?? new Prisma.Decimal(0)
  const chargedCredits = roundCreditCharge(
    decimalTokenCharge(promptTokens, inputCredits).plus(
      decimalTokenCharge(completionTokens, outputCredits)
    )
  )
  const estimatedCostUsd = decimalTokenCharge(promptTokens, inputCostUsd).plus(
    decimalTokenCharge(completionTokens, outputCostUsd)
  )

  if (chargedCredits.lte(0)) {
    return null
  }

  return createCreditLedgerEntry({
    actorUserId,
    costUsd: estimatedCostUsd,
    credits: chargedCredits.negated(),
    description: `Agent usage (${model})`,
    metadata: {
      completionTokens,
      inputCostUsd: price.inputCostUsd?.toString() ?? null,
      inputCredits: price.inputCredits?.toString() ?? null,
      model,
      outputCostUsd: price.outputCostUsd?.toString() ?? null,
      outputCredits: price.outputCredits?.toString() ?? null,
      pricingId: price.id,
      projectId: projectId ?? null,
      promptTokens,
      provider: price.provider,
      totalTokens: usage.totalTokens ?? promptTokens + completionTokens,
      unit: price.unit
    },
    meterType: llmMeterType,
    projectId,
    sourceId: requestId,
    sourceType: 'agent_run'
  })
}

async function createCreditLedgerEntry({
  actorUserId,
  costUsd,
  credits,
  description,
  metadata,
  meterType,
  projectId,
  sourceId,
  sourceType
}: {
  actorUserId: string
  costUsd?: Prisma.Decimal | null
  credits: Prisma.Decimal
  description: string
  metadata?: Prisma.InputJsonValue
  meterType: string
  projectId?: string | null
  sourceId: string
  sourceType: string
}) {
  return prisma.$transaction(async (tx) => {
    const existingEntry = await tx.creditLedgerEntry.findUnique({
      where: {
        sourceType_sourceId_meterType: {
          meterType,
          sourceId,
          sourceType
        }
      },
      select: {
        credits: true,
        id: true
      }
    })

    if (existingEntry) {
      return existingEntry
    }

    const account = await tx.billingAccount.upsert({
      where: {
        ownerUserId: actorUserId
      },
      update: {},
      create: {
        ownerUserId: actorUserId
      },
      select: {
        id: true
      }
    })
    const entry = await tx.creditLedgerEntry.create({
      data: {
        accountId: account.id,
        actorUserId,
        costUsd,
        credits,
        description,
        metadata,
        meterType,
        projectId: projectId ?? null,
        sourceId,
        sourceType
      },
      select: {
        credits: true,
        id: true
      }
    })

    await tx.billingAccount.update({
      where: {
        id: account.id
      },
      data: {
        creditBalance: {
          increment: credits
        }
      }
    })

    return entry
  })
}

async function findActiveUsagePrice({
  meterType,
  model
}: {
  meterType: string
  model?: string | null
}) {
  return prisma.usagePrice.findFirst({
    where: {
      effectiveFrom: {
        lte: new Date()
      },
      effectiveTo: null,
      meterType,
      OR: model
        ? [
            {
              model
            },
            {
              model: stripProviderPrefix(model)
            }
          ]
        : [
            {
              model: null
            }
          ]
    },
    orderBy: {
      effectiveFrom: 'desc'
    }
  })
}

function decimalTokenCharge(tokens: number, pricePerMillion: Prisma.Decimal) {
  return new Prisma.Decimal(tokens).div(million).mul(pricePerMillion)
}

function roundCreditCharge(credits: Prisma.Decimal) {
  return credits.ceil()
}

function stripProviderPrefix(model: string) {
  return model.includes('/') ? (model.split('/').pop() ?? model) : model
}
