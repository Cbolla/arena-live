import { useState } from 'react';

export function PresenterAvatar({ image, speaking, label = 'Rosto do apresentador' }: { image?: string; speaking: boolean; label?: string }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const showImage = Boolean(image && image !== failedImage);
  return <div className={'presenter-avatar ' + (speaking ? 'speaking' : '')}>
    {showImage ? <><img src={image} alt={label} onError={() => setFailedImage(image!)}/><span className="presenter-mouth-overlay" aria-hidden="true"><i/></span></> : <svg viewBox="0 0 120 120" role="img" aria-label="Capivara apresentadora da Arena Live">
      <defs>
        <linearGradient id="presenter-fur" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d99a58"/><stop offset="1" stopColor="#985632"/></linearGradient>
        <linearGradient id="presenter-muzzle" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#f1c58c"/><stop offset="1" stopColor="#d99b64"/></linearGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill="#132334"/>
      <ellipse cx="29" cy="36" rx="10" ry="13" fill="#88502f"/><ellipse cx="91" cy="36" rx="10" ry="13" fill="#88502f"/>
      <ellipse cx="29" cy="37" rx="5" ry="7" fill="#d99a68"/><ellipse cx="91" cy="37" rx="5" ry="7" fill="#d99a68"/>
      <path d="M20 61c0-29 16-47 40-47s40 18 40 47c0 28-16 47-40 47S20 89 20 61" fill="url(#presenter-fur)" stroke="#f2c27d" strokeWidth="2"/>
      <ellipse cx="60" cy="72" rx="33" ry="24" fill="url(#presenter-muzzle)"/>
      <ellipse cx="47" cy="57" rx="3" ry="4" fill="#18202a"/><ellipse cx="73" cy="57" rx="3" ry="4" fill="#18202a"/>
      <ellipse cx="60" cy="66" rx="13" ry="8" fill="#402923"/>
      <ellipse cx="55" cy="65" rx="2" ry="1.5" fill="#f6dfbb"/><ellipse cx="65" cy="65" rx="2" ry="1.5" fill="#f6dfbb"/>
      <ellipse className="presenter-mouth" cx="60" cy="83" rx="8" ry="3" fill="#552b2a"/>
      <path className="presenter-teeth" d="M55 82v4m10-4v4" stroke="#fff1d2" strokeWidth="2" strokeLinecap="round"/>
    </svg>}
  </div>;
}
