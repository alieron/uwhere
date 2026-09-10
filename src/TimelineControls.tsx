import { Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DAYS, formatTime } from './waterloo';
import type { Day } from './waterloo';

interface Props {
  selectedDay: Day;
  selectedTime: string;
  onSelectDay: (day: Day) => void;
  onJumpToNow: () => void;
}

export default function TimelineControls({
  selectedDay,
  selectedTime,
  onSelectDay,
  onJumpToNow,
}: Props) {
  return (
    <header className="relative grid shrink-0 grid-cols-[1fr_auto] items-center gap-2 border-b px-3 py-3 lg:flex lg:px-4">
      <ToggleGroup
        aria-label="Day of week"
        value={[selectedDay]}
        onValueChange={(days) => days[0] && onSelectDay(days[0] as Day)}
        variant="outline"
        size="sm"
        spacing={0}
        className="order-3 col-span-2 grid h-11 w-full grid-cols-6 lg:order-1 lg:col-span-1 lg:flex lg:h-auto lg:w-auto"
      >
        {DAYS.map((day) => (
          <ToggleGroupItem
            key={day}
            value={day}
            aria-label={day}
            className="h-11 min-w-0 px-1 data-pressed:bg-primary data-pressed:text-primary-foreground lg:h-7 lg:min-w-10 lg:px-2"
          >
            <span className="lg:hidden">{day.slice(0, 2)}</span>
            <span className="hidden lg:inline">{day.slice(0, 3)}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <span className="pointer-events-none absolute left-1/2 top-3 flex h-11 -translate-x-1/2 items-center text-sm font-semibold tabular-nums lg:inset-y-0 lg:top-0 lg:h-auto" aria-live="polite">
        {formatTime(selectedTime)}
      </span>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onJumpToNow}
        aria-label="Jump to now"
        className="order-2 col-start-2 h-11 justify-self-end lg:ml-auto lg:h-7"
      >
        <Clock3 data-icon="inline-start" />
        Now
      </Button>
    </header>
  );
}
