'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Eraser, MoreHorizontal, Trash2 } from 'lucide-react';
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
import { useRouter } from 'next/navigation';

type ProjectSettingsMenuProps = {
  isClearHistoryDisabled?: boolean;
  onClearHistory?: () => void;
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

export function ProjectSettingsMenu({
  isClearHistoryDisabled = false,
  onClearHistory,
  project
}: ProjectSettingsMenuProps) {
  const router = useRouter();
  const { format, t } = useI18n();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmations, setDeleteConfirmations] = useState<DeleteConfirmations>(
    initialDeleteConfirmations
  );
  const menuRef = useRef<HTMLDivElement | null>(null);
  const canConfirmDelete =
    deleteConfirmations.database && deleteConfirmations.code && deleteConfirmations.data;

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    function closeOnPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMenuOpen]);

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

      setIsDeleteOpen(false);
      router.push('/home');
      router.refresh();
    } catch {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <div className="project-settings-menu" ref={menuRef}>
        <Button
          aria-expanded={isMenuOpen}
          aria-haspopup="menu"
          aria-label={t.project.settingsAria}
          onClick={() => setIsMenuOpen((currentValue) => !currentValue)}
          title={t.project.settingsAria}
          variant="icon"
        >
          <MoreHorizontal size={16} />
        </Button>

        {isMenuOpen ? (
          <div className="account-menu-popover project-settings-popover" role="menu">
            {onClearHistory ? (
              <button
                className="account-menu-item"
                disabled={isClearHistoryDisabled}
                onClick={() => {
                  setIsMenuOpen(false);
                  onClearHistory();
                }}
                role="menuitem"
                type="button"
              >
                <Eraser size={16} />
                {t.chat.clearAria}
              </button>
            ) : null}
            <button
              className="account-menu-item project-settings-danger-item"
              onClick={() => {
                setIsMenuOpen(false);
                setIsDeleteOpen(true);
              }}
              role="menuitem"
              type="button"
            >
              <Trash2 size={16} />
              {t.desktop.deleteAction}
            </button>
          </div>
        ) : null}
      </div>

      <Dialog
        onOpenChange={(open) => {
          setIsDeleteOpen(open);

          if (!open) {
            setDeleteConfirmations(initialDeleteConfirmations);
          }
        }}
        open={isDeleteOpen}
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
