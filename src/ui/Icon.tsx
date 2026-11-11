const icons = {
  helmet: ['primary', 0, 0],
  ticket: ['primary', 1, 0],
  gem: ['primary', 2, 0],
  armor: ['primary', 3, 0],
  scroll: ['primary', 0, 1],
  tower: ['primary', 1, 1],
  trophy: ['primary', 2, 1],
  horn: ['primary', 3, 1],
  heart: ['primary', 0, 2],
  rain: ['primary', 1, 2],
  coin: ['primary', 2, 2],
  settings: ['primary', 3, 2],
  sword: ['primary', 0, 3],
  bow: ['primary', 1, 3],
  shield: ['primary', 2, 3],
  pack: ['primary', 3, 3],
  users: ['world', 0, 0],
  target: ['world', 1, 0],
  loop: ['world', 2, 0],
  level: ['world', 3, 0],
  flag: ['world', 0, 1],
  lock: ['world', 1, 1],
  unlock: ['world', 2, 1],
  clock: ['world', 3, 1],
  spark: ['world', 0, 2],
  bolt: ['world', 1, 2],
  gift: ['world', 2, 2],
  amulet: ['world', 3, 2],
  pickaxe: ['world', 0, 3],
  flask: ['world', 1, 3],
  sound: ['world', 2, 3],
  mute: ['world', 3, 3],
  check: ['controls', 0, 0],
  pause: ['controls', 1, 0],
  play: ['controls', 2, 0],
  list: ['controls', 3, 0],
  grid: ['controls', 0, 1],
  up: ['controls', 1, 1],
  down: ['controls', 2, 1],
  top: ['controls', 3, 1],
  plus: ['controls', 0, 2],
  close: ['controls', 1, 2],
  cloud: ['controls', 2, 2],
  upload: ['controls', 3, 2],
  download: ['controls', 0, 3],
  login: ['controls', 1, 3],
  logout: ['controls', 2, 3],
} as const;

export type IconName = keyof typeof icons;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const [sheet, column, row] = icons[name];
  return (
    <span
      className={className ? `ui-icon ${className}` : 'ui-icon'}
      aria-hidden="true"
      style={{
        backgroundImage: `url("./assets/icons/painted/${sheet}.png")`,
        backgroundSize: '400% 400%',
        backgroundPosition: `${column * 100 / 3}% ${row * 100 / 3}%`,
        backgroundRepeat: 'no-repeat',
      }}
    />
  );
}
