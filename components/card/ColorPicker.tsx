import OperumButton from '@/components/ui/GlassButton'
import { CardColor, CARD_COLORS } from '@/types/kanban'

interface ColorPickerProps {
  value: CardColor
  onChange: (color: CardColor) => void
}

export default function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {CARD_COLORS.map(({ value: color, label }) => (
        <OperumButton variant="custom"
          key={color}
          type="button"
          title={label}
          onClick={() => onChange(color)}
          className="w-7 h-7 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{
            backgroundColor: color,
            boxShadow: value === color ? `0 0 0 3px white, 0 0 0 5px ${color}` : undefined,
            transform: value === color ? 'scale(1.15)' : undefined,
          }}
          aria-label={`Cor ${label}${value === color ? ' (selecionada)' : ''}`}
          aria-pressed={value === color}
        />
      ))}
    </div>
  )
}
