import { state } from '../core/state.js';
import { PICKER } from '../core/dom.js';

export function bindPickerKeyboard({ renderPokedex }) {
  PICKER.searchInput.addEventListener('keydown', (event) => {
    const items = PICKER.resultList.querySelectorAll('[data-action="pick-result"]');
    const max = items.length - 1;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      state.pickerSearch.highlightedIndex = Math.min(max, (state.pickerSearch.highlightedIndex || 0) + 1);
      renderPokedex(PICKER.searchInput.value);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      state.pickerSearch.highlightedIndex = Math.max(0, (state.pickerSearch.highlightedIndex || 0) - 1);
      renderPokedex(PICKER.searchInput.value);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const active = PICKER.resultList.querySelector('[data-action="pick-result"].active');
      if (active) active.click();
      return;
    }

    if (/^[1-5]$/.test(event.key)) {
      const btn = PICKER.resultList.querySelector(`[data-action="pick-result"][data-index="${Number(event.key) - 1}"]`);
      if (btn) {
        event.preventDefault();
        btn.click();
      }
    }
  });
}
