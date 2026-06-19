import type { Prisma } from '@prisma/client'

import { deletePlatformStorageObject } from '@/server/storage'

export type DeletedUploadedFile = {
  id: string
  storageBucket: string
  storageKey: string
  thumbnail: {
    id: string
    storageBucket: string
    storageKey: string
  } | null
}

export async function deleteUploadedFileStorageObjects(file: DeletedUploadedFile) {
  if (file.storageBucket && file.storageKey) {
    await deletePlatformStorageObject({
      bucket: file.storageBucket,
      key: file.storageKey
    })
  }

  if (file.thumbnail?.storageBucket && file.thumbnail.storageKey) {
    await deletePlatformStorageObject({
      bucket: file.thumbnail.storageBucket,
      key: file.thumbnail.storageKey
    })
  }
}

export async function markUploadedFileDeleted(
  tx: Prisma.TransactionClient,
  file: DeletedUploadedFile
) {
  if (file.thumbnail) {
    await deleteUploadedFileDerivedData(tx, file.thumbnail.id)
    await tx.uploadedFile.update({
      where: {
        id: file.thumbnail.id
      },
      data: {
        deletedAt: new Date(),
        error: null,
        status: 'deleted',
        storageBucket: '',
        storageKey: ''
      }
    })
  }

  await deleteUploadedFileDerivedData(tx, file.id)
  await tx.uploadedFile.update({
    where: {
      id: file.id
    },
    data: {
      deletedAt: new Date(),
      error: null,
      status: 'deleted',
      storageBucket: '',
      storageKey: '',
      thumbnailId: null
    }
  })
}

async function deleteUploadedFileDerivedData(
  tx: Prisma.TransactionClient,
  uploadedFileId: string
) {
  await tx.uploadedFileChunk.deleteMany({
    where: {
      uploadedFileId
    }
  })
  await tx.uploadedFileExtraction.deleteMany({
    where: {
      uploadedFileId
    }
  })
}
