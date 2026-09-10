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
import { addStudent, updateStudent } from './store';
import type { AppState, Student } from './store';

const PRESETS = [
  '#2f80ed', '#16a34a', '#f59e0b', '#dc2626',
  '#7c3aed', '#0891b2', '#db2777', '#64748b',
] as const;

interface Props {
  onClose: () => void;
  studentCount: number;
  student?: Student;
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onDelete: (id: string) => void;
}

export default function AddStudentModal({ onClose, studentCount, student, state, setState, onDelete }: Props) {
  const isEditing = Boolean(student);
  const [scheduleText, setScheduleText] = useState('');
  const [name, setName] = useState(() => student?.name ?? '');
  const [color, setColor] = useState(() => student?.color ?? defaultColor(studentCount));
  const [error, setError] = useState('');
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

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    if (student) {
      updateStudent(student.id, {
        name: name.trim() || student.name,
        color,
        ...(preview.schedule ?? {}),
      }, setState);
    } else if (preview.schedule) {
      addStudent(preview.schedule, name, color, state, setState);
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {confirmingDelete && student ? (
          <>
            <DialogHeader>
              <DialogTitle>Delete {student.name}?</DialogTitle>
              <DialogDescription>
                Their timetable will be removed from this browser. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmingDelete(false)}>
                Keep person
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  onDelete(student.id);
                  onClose();
                }}
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
                onChange={(event) => setName(event.target.value)}
                placeholder={student?.name ?? `Person ${studentCount + 1}`}
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
                  onChange={(event) => setColor(event.target.value)}
                  className="size-10 shrink-0 p-1"
                />
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
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
              <Button type="button" variant="destructive" className="sm:mr-auto" onClick={() => setConfirmingDelete(true)}>
                Delete person
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">
              {isEditing ? 'Save person' : 'Add person'}
            </Button>
          </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
