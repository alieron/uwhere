import { useMemo, useState } from 'react';
import { ClipboardPaste, Palette } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { parseWaterlooSchedule, defaultColor } from './waterloo';
import type { ParsedSchedule } from './waterloo';
import type { Student } from './group';

const PRESETS = [
  '#2f80ed', '#16a34a', '#f59e0b', '#dc2626',
  '#7c3aed', '#0891b2', '#db2777', '#64748b',
] as const;

interface Props {
  onClose: () => void;
  studentCount: number;
  student?: Student;
  onSave: (value: { name: string; color: string; schedule: ParsedSchedule | null }) => Promise<void>;
  onDelete: () => Promise<void>;
}

export default function AddStudentModal({ onClose, studentCount, student, onSave, onDelete }: Props) {
  const isEditing = Boolean(student);
  const [scheduleText, setScheduleText] = useState('');
  const [name, setName] = useState(() => student?.name ?? '');
  const [color, setColor] = useState(() => student?.color ?? defaultColor(studentCount));
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const preview = useMemo(() => {
    if (!scheduleText.trim()) return { schedule: null, error: '' };
    try {
      return { schedule: parseWaterlooSchedule(scheduleText), error: '' };
    } catch (parseError) {
      return { schedule: null, error: parseError instanceof Error ? parseError.message : String(parseError) };
    }
  }, [scheduleText]);
  const previewCourses = preview.schedule
    ? [...new Set(preview.schedule.slots.map((slot) => slot.courseCode))]
    : [];

  function validate(): boolean {
    if (!scheduleText.trim() && !student) {
      setError('Paste your Quest Class Schedule List View.');
      return false;
    }
    if (scheduleText.trim() && !preview.schedule) {
      setError(preview.error);
      return false;
    }
    setError('');
    return true;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !validate()) return;
    setPending(true);
    try {
      await onSave({
        name: name.trim() || student?.name || `Person ${studentCount + 1}`,
        color,
        schedule: preview.schedule,
      });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Something went wrong. Try again.');
    } finally {
      setPending(false);
    }
  }

  async function deletePerson() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await onDelete();
      onClose();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Something went wrong. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg" aria-busy={pending} showCloseButton={!pending}>
        {confirmingDelete && student ? (
          <>
            <DialogHeader>
              <DialogTitle>Delete {student.name}?</DialogTitle>
              <DialogDescription>
                Their timetable will be removed from the shared group for everyone. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <FieldError>{error}</FieldError>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirmingDelete(false)}>
                Keep person
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() => void deletePerson()}
              >
                Delete person
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit person' : 'Add a timetable'}</DialogTitle>
            <DialogDescription>
              In Quest, open Class Schedule, choose List View, then select all, copy, and paste below.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="quest-schedule">
                <ClipboardPaste />
                Quest Class Schedule
              </FieldLabel>
              <textarea
                id="quest-schedule"
                value={scheduleText}
                disabled={pending}
                onChange={(event) => {
                  setScheduleText(event.target.value);
                  if (error) setError('');
                }}
                placeholder={isEditing ? 'Leave empty to keep the current timetable' : 'Paste the complete Quest List View here'}
                spellCheck={false}
                autoFocus
                aria-invalid={Boolean(error)}
                className="min-h-32 w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30"
              />
              <FieldError>{error}</FieldError>
            </Field>

            {preview.schedule && previewCourses.length > 0 && (
              <div className="flex flex-wrap gap-1.5 rounded-md border bg-muted p-3" aria-label="Imported courses">
                <Badge>{preview.schedule.term} {preview.schedule.year}</Badge>
                {previewCourses.map((courseCode) => (
                  <Badge key={courseCode} variant="outline">{courseCode}</Badge>
                ))}
              </div>
            )}

            <Field>
              <FieldLabel htmlFor="person-name">Name</FieldLabel>
              <Input
                id="person-name"
                value={name}
                disabled={pending}
                onChange={(event) => setName(event.target.value)}
                placeholder={student?.name ?? `Person ${studentCount + 1}`}
                maxLength={80}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="person-color">
                <Palette />
                Colour
              </FieldLabel>
              <div className="flex min-h-11 flex-wrap items-center gap-2">
                <Input
                  id="person-color"
                  type="color"
                  value={color}
                  disabled={pending}
                  onChange={(event) => setColor(event.target.value)}
                  className="size-10 shrink-0 p-1"
                />
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={pending}
                    onClick={() => setColor(preset)}
                    aria-label={`Use colour ${preset}`}
                    aria-pressed={color === preset}
                    className="size-8 rounded-full border-2 border-background outline-offset-2 transition-transform active:scale-95 aria-pressed:outline-2 aria-pressed:outline-primary"
                    style={{ backgroundColor: preset }}
                  />
                ))}
              </div>
            </Field>
          </FieldGroup>

          <DialogFooter>
            {isEditing && (
              <Button type="button" variant="destructive" className="sm:mr-auto" disabled={pending} onClick={() => setConfirmingDelete(true)}>
                Delete person
              </Button>
            )}
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {isEditing ? 'Save person' : 'Add person'}
            </Button>
          </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
