import { useId, useState } from 'react';
import {
  AlertCircle,
  Check,
  Link2,
  LoaderCircle,
  LogOut,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { GroupSnapshot } from './group';
import { GroupConflictError } from './group-client';

export interface GroupControlsProps {
  groups: { token: string; name: string }[];
  activeToken: string | null;
  activeSnapshot: GroupSnapshot | null;
  loading: boolean;
  saving: boolean;
  syncError?: string | null;
  storageWarning?: string | null;
  onSelect: (token: string) => void;
  onCreate: () => Promise<void>;
  onRename: (name: string, capturedToken: string, capturedRevision: number) => Promise<void>;
  onCopyInvite: (capturedToken: string) => Promise<void>;
  onLeave: (capturedToken: string) => void;
  onDelete: (capturedToken: string, capturedRevision: number) => Promise<void>;
}

type PendingAction = 'create' | 'rename' | 'copy' | 'delete' | null;

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Something went wrong. Try again.';
}

export default function GroupControls({
  groups,
  activeToken,
  activeSnapshot,
  loading,
  saving,
  syncError,
  storageWarning,
  onSelect,
  onCreate,
  onRename,
  onCopyInvite,
  onLeave,
  onDelete,
}: GroupControlsProps) {
  const nameId = useId();
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [name, setName] = useState('');
  const [initialName, setInitialName] = useState('');
  const [capturedToken, setCapturedToken] = useState<string | null>(null);
  const [capturedRevision, setCapturedRevision] = useState<number | null>(null);
  const [deleteRevision, setDeleteRevision] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [actionError, setActionError] = useState('');
  const [launcherError, setLauncherError] = useState('');
  const [nameError, setNameError] = useState('');
  const [copied, setCopied] = useState(false);
  const busy = saving || pending !== null;
  const availableSnapshot = capturedToken === activeToken ? activeSnapshot : null;
  const availableRevision = capturedRevision ?? availableSnapshot?.revision ?? null;
  const displayedName = capturedRevision === null && availableSnapshot ? availableSnapshot.name : name;
  const displayedInitialName = capturedRevision === null && availableSnapshot
    ? availableSnapshot.name
    : initialName;

  function openManage() {
    if (!activeToken) return;
    setName(activeSnapshot?.name ?? '');
    setInitialName(activeSnapshot?.name ?? '');
    setCapturedToken(activeToken);
    setCapturedRevision(activeSnapshot?.revision ?? null);
    setDeleteRevision(null);
    setConfirmingDelete(false);
    setActionError('');
    setNameError('');
    setCopied(false);
    setOpen(true);
  }

  function closeManage() {
    if (busy) return;
    setOpen(false);
    setConfirmingDelete(false);
  }

  async function createGroup(fromDialog: boolean) {
    if (busy) return;
    setPending('create');
    setActionError('');
    setLauncherError('');
    try {
      await onCreate();
      if (fromDialog) setOpen(false);
    } catch (error) {
      const message = errorMessage(error);
      if (fromDialog) setActionError(message);
      else setLauncherError(message);
    } finally {
      setPending(null);
    }
  }

  async function renameGroup(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const nextName = name.trim();
    if (!nextName) {
      setNameError('Enter a group name.');
      return;
    }
    if (capturedToken === null || availableRevision === null) {
      setActionError('This group is not ready yet. Try again.');
      return;
    }

    setPending('rename');
    setActionError('');
    setNameError('');
    try {
      await onRename(nextName, capturedToken, availableRevision);
      setOpen(false);
    } catch (error) {
      if (error instanceof GroupConflictError) {
        setCapturedRevision(error.snapshot.revision);
        if (deleteRevision !== null) setDeleteRevision(error.snapshot.revision);
      }
      setActionError(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  async function copyInvite() {
    if (busy) return;
    if (capturedToken === null) {
      setActionError('This group is not ready yet. Try again.');
      return;
    }
    setPending('copy');
    setActionError('');
    setCopied(false);
    try {
      await onCopyInvite(capturedToken);
      setCopied(true);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  async function deleteGroup() {
    if (busy || capturedToken === null || deleteRevision === null) return;
    setPending('delete');
    setActionError('');
    try {
      await onDelete(capturedToken, deleteRevision);
      setOpen(false);
    } catch (error) {
      if (error instanceof GroupConflictError) setDeleteRevision(error.snapshot.revision);
      setActionError(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  const statusError = launcherError || syncError;

  return (
    <section
      className="absolute left-3 top-3 z-10 w-[calc(100vw-9.5rem)] sm:left-4 sm:top-4 sm:w-xs"
      aria-label="Group controls"
    >
      {groups.length === 0 ? (
        <Button
          type="button"
          size="lg"
          className="h-11 shadow-lg"
          disabled={busy}
          onClick={() => void createGroup(false)}
        >
          {pending === 'create' ? (
            <LoaderCircle className="animate-spin" data-icon="inline-start" />
          ) : (
            <Plus data-icon="inline-start" />
          )}
          Create group
        </Button>
      ) : (
        <div className="flex h-11 min-w-0 items-center gap-1 rounded-lg border bg-card/95 p-1 text-card-foreground shadow-lg backdrop-blur-md">
          <NativeSelect
            size="sm"
            className="min-w-0 flex-1"
            aria-label="Current group"
            value={activeToken ?? ''}
            disabled={saving}
            onChange={(event) => {
              setLauncherError('');
              onSelect(event.target.value);
            }}
          >
            {!activeToken && <NativeSelectOption value="">Choose group</NativeSelectOption>}
            {groups.map((group) => (
              <NativeSelectOption key={group.token} value={group.token}>
                {group.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>

          {activeToken && !activeSnapshot && (
            <span className="flex shrink-0 items-center gap-1 px-1 text-xs text-muted-foreground" role="status">
              {loading && !syncError && <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />}
              {syncError ? 'Sync issue' : loading ? 'Loading…' : 'Unavailable'}
            </span>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label="Manage group"
            disabled={!activeToken || saving}
            onClick={openManage}
          >
            <Settings />
          </Button>
        </div>
      )}

      {statusError && !open && (
        <div
          className="mt-1 flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-card/95 px-2.5 py-2 text-xs text-destructive shadow-lg backdrop-blur-md"
          role="alert"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{statusError}</span>
        </div>
      )}

      {storageWarning && !open && (
        <div
          className="mt-1 flex items-start gap-1.5 rounded-lg border bg-card/95 px-2.5 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
          role="alert"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{storageWarning}</span>
        </div>
      )}

      <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && closeManage()}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
          showCloseButton={!busy}
          aria-busy={busy}
        >
          {confirmingDelete ? (
            <>
              <DialogHeader>
                <DialogTitle>Delete “{initialName}”?</DialogTitle>
                <DialogDescription>
                  This permanently deletes the group for everyone with its link. This cannot be undone.
                </DialogDescription>
              </DialogHeader>

              {(actionError || syncError) && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{actionError || syncError}</span>
                </div>
              )}

              {storageWarning && (
                <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-foreground" role="alert">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{storageWarning}</span>
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setConfirmingDelete(false);
                    setActionError('');
                  }}
                >
                  Keep group
                </Button>
                <Button type="button" variant="destructive" disabled={busy} onClick={() => void deleteGroup()}>
                  {pending === 'delete' && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
                  Delete for everyone
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form className="flex flex-col gap-5" onSubmit={(event) => void renameGroup(event)}>
              <DialogHeader>
                <DialogTitle>Manage group</DialogTitle>
                <DialogDescription>
                  Rename, invite people, or manage this group on your device.
                </DialogDescription>
              </DialogHeader>

              <Field data-invalid={Boolean(nameError)}>
                <FieldLabel htmlFor={nameId}>Group name</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id={nameId}
                    value={displayedName}
                    maxLength={80}
                    disabled={busy || availableRevision === null}
                    aria-invalid={Boolean(nameError)}
                    onChange={(event) => {
                      if (capturedRevision === null && availableSnapshot) {
                        setCapturedRevision(availableSnapshot.revision);
                        setInitialName(availableSnapshot.name);
                      }
                      setName(event.target.value);
                      setNameError('');
                    }}
                  />
                  <Button
                    type="submit"
                    disabled={busy || availableRevision === null || !displayedName.trim() || displayedName.trim() === displayedInitialName}
                  >
                    {pending === 'rename' && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
                    Save
                  </Button>
                </div>
                <FieldError>{nameError}</FieldError>
              </Field>

              <Field className="rounded-lg border bg-muted/40 p-3">
                <FieldLabel>
                  <Link2 />
                  Invite link
                </FieldLabel>
                <FieldDescription>Anyone with the link can view and edit this group.</FieldDescription>
                <Button type="button" variant="outline" disabled={busy} onClick={() => void copyInvite()}>
                  {pending === 'copy' ? (
                    <LoaderCircle className="animate-spin" data-icon="inline-start" />
                  ) : copied ? (
                    <Check data-icon="inline-start" />
                  ) : (
                    <Link2 data-icon="inline-start" />
                  )}
                  {copied ? 'Invite link copied' : 'Copy invite link'}
                </Button>
              </Field>

              {(actionError || syncError) && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{actionError || syncError}</span>
                </div>
              )}

              {storageWarning && (
                <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-foreground" role="alert">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{storageWarning}</span>
                </div>
              )}

              {!actionError && !syncError && availableRevision === null && (
                <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground" role="status">
                  {loading && <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" />}
                  <span>{loading ? 'Loading group details…' : 'Group details are unavailable.'}</span>
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" variant="outline" disabled={busy} onClick={() => void createGroup(true)}>
                  {pending === 'create' ? (
                    <LoaderCircle className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <Plus data-icon="inline-start" />
                  )}
                  Create another
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    if (capturedToken) onLeave(capturedToken);
                    setOpen(false);
                  }}
                >
                  <LogOut data-icon="inline-start" />
                  Leave on this device
                </Button>
              </div>

              <div className="flex flex-col gap-3 border-t border-destructive/20 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">Delete the shared group for everyone.</p>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy || availableRevision === null}
                  onClick={() => {
                    setDeleteRevision(availableRevision);
                    setActionError('');
                    setConfirmingDelete(true);
                  }}
                >
                  <Trash2 data-icon="inline-start" />
                  Delete group
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
