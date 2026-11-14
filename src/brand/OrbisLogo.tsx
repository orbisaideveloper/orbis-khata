import mark from './orbis-mark.webp';
import wordmark from './orbis-wordmark.webp';

export function OrbisLogo({ withWordmark = false }: Readonly<{ withWordmark?: boolean }>) {
  return <img className="orbis-logo" src={withWordmark ? wordmark : mark} alt={withWordmark ? 'ORBIS' : ''} width="40" height="40" />;
}
