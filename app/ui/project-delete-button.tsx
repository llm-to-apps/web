'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from './button';
import { CheckboxField } from './checkbox-field';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './dialog';
import { useI18n } from './i18n-provider';

type ProjectDeleteButtonProps = {
  project: {
    id: string;
    domain: string;
    templateName: string;
  };
};

type DeleteConfirmations = {
  database: boolean;
  code: boolean;
  data: boolean;
};

const initialDeleteConfirmations: DeleteConfirmations = {
  database: false,
  code: false,
  data: false
};

export function ProjectDeleteButton({ project }: ProjectDeleteButtonProps) {
  const router = useRouter();
  const { format, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmations, setDeleteConfirmations] = useState<DeleteConfirmations>(
    initialDeleteConfirmations
  );
  const canConfirmDelete =
    deleteConfirmations.database && deleteConfirmations.code && deleteConfirmations.data;

  function updateDeleteConfirmation(key: keyof DeleteConfirmations, value: boolean) {
    setDeleteConfirmations((currentValue) => ({
      ...currentValue,
      [key]: value
    }));
  }

  async function deleteProject() {
    if (!canConfirmDelete || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: 'DELETE'
      });
      const data = (await response.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; message?: string }
        | null;

      if (!response.ok || !data?.ok) {
        throw new Error(data && 'message' in data ? data.message : t.desktop.deleteFailed);
      }

      setIsOpen(false);
      router.push('/home');
      router.refresh();
    } catch {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)} variant="danger">
        <Trash2 size={16} />
        {t.desktop.deleteAction}
      </Button>
      <Dialog
        onOpenChange={(open) => {
          setIsOpen(open);

          if (!open) {
            setDeleteConfirmations(initialDeleteConfirmations);
          }
        }}
        open={isOpen}
      >
        <DialogContent className="border-red-200">
          <DialogHeader className="grid-cols-[42px_minmax(0,1fr)_34px] border-red-100">
            <div className="grid size-[42px] place-items-center rounded-lg bg-red-50 text-red-700">
              <AlertTriangle size={22} />
            </div>
            <div>
              <DialogTitle>
                {format(t.desktop.deleteTitle, { name: project.templateName })}
              </DialogTitle>
              <DialogDescription>{t.desktop.deleteDescription}</DialogDescription>
            </div>
            <DialogCloseButton />
          </DialogHeader>

          <DialogBody>
            <p className="m-0 text-sm leading-5 text-slate-500">
              {format(t.desktop.deleteBody, { domain: project.domain })}
            </p>

            <CheckboxField
              checked={deleteConfirmations.database}
              onCheckedChange={(checked) =>
                updateDeleteConfirmation('database', checked === true)
              }
            >
              {t.desktop.confirmDatabase}
            </CheckboxField>
            <CheckboxField
              checked={deleteConfirmations.code}
              onCheckedChange={(checked) => updateDeleteConfirmation('code', checked === true)}
            >
              {t.desktop.confirmCode}
            </CheckboxField>
            <CheckboxField
              checked={deleteConfirmations.data}
              onCheckedChange={(checked) => updateDeleteConfirmation('data', checked === true)}
            >
              {t.desktop.confirmData}
            </CheckboxField>
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={isDeleting} variant="ghost">
                {t.desktop.cancel}
              </Button>
            </DialogClose>
            <Button
              disabled={!canConfirmDelete}
              loading={isDeleting}
              onClick={() => void deleteProject()}
              variant="danger"
            >
              <Trash2 size={16} />
              {t.desktop.deleteAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
