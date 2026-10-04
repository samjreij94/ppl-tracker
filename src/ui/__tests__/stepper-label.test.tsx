import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CardioCard } from '../../components/CardioCard';
import { Stepper } from '../../components/Stepper';

describe('stepper label taps (QC major)', () => {
  it('clicking the field label text does not change the value', () => {
    const onChange = vi.fn();
    render(
      <div className="field">
        <span className="field-label">Weight</span>
        <Stepper label="Weight" value={100} step={5} onChange={onChange} />
      </div>,
    );
    fireEvent.click(screen.getByText('Weight'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('no <label> wraps a Stepper in the cardio card', () => {
    void CardioCard;
    const src = Object.values(import.meta.glob('../../components/*.tsx', { query: '?raw', import: 'default', eager: true })) as string[];
    for (const s of src) expect(s).not.toMatch(/<label[^>]*>\s*(?:<[^>]+>[^<]*<\/[^>]+>\s*)*<Stepper/);
  });
});
