// frontend/src/sfx/useGlobalSfx.js
import { useEffect } from 'react';
import { playSfx } from './sfx';

import clickMp3 from '../assets/sfx/click.mp3';
import hoverMp3 from '../assets/sfx/hover.mp3';

export default function useGlobalSfx({ hover = false } = {}) {
  useEffect(() => {
    const onClick = (e) => {
      const t = e.target;
      // closest catches clicks on icons inside buttons
      const btn = t?.closest?.('button, a, [role="button"]');
      if (!btn) return;
      if (btn.disabled) return;
      playSfx(clickMp3);
    };

    const onOver = (e) => {
      if (!hover) return;
      const t = e.target;
      const btn = t?.closest?.('button, a, [role="button"]');
      if (!btn) return;
      if (btn.disabled) return;
      playSfx(hoverMp3);
    };

    document.addEventListener('click', onClick, true);
    document.addEventListener('mouseover', onOver, true);

    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mouseover', onOver, true);
    };
  }, [hover]);
}
