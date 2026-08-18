import styled, { css } from 'styled-components';

const SLIDER_HEIGHT = '10px';
const INPUT_COLOR_HEX = '#be4bdb';

export const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0 0;
  height: 100%;
`;

export const FieldSet = styled.fieldset`
  border: none;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.25rem;
  height: 100%;
`;

export const Legend = styled.legend`
  font-size: 145%;
  color: rgb(214, 146, 255);
  font-weight: 700;
  font-variant: all-petite-caps;
  text-shadow: #00000085 0 0 0.25rem;
  margin-bottom: 0.5rem;
`;

export const Row = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 0.75rem;
`;

export const BaseSettingsInputStyle = css`
  display: flex;
  align-items: center;
`;

export const Label = styled.label`
  ${BaseSettingsInputStyle}
  width: 100%;
  white-space: nowrap;
`;

export const Input = styled.input`
  ${BaseSettingsInputStyle}

  &[type='button'],
  &[type='submit'] {
    padding: 0.3rem 0.9rem;
    cursor: pointer;
  }
`;

export const ColorInput = styled(Input).attrs({
  type: 'color',
})`
  width: 1.5rem;
  height: 1.5rem;
  margin-left: 0.25rem;
`;

export const RangeValue = styled.div`
  min-width: 1.5rem;
  margin-left: 0.5rem;
  text-align: right;
`;

export const Select = styled.select`
  ${BaseSettingsInputStyle}
  margin-left: 0.25rem;
`;

export const Slider = styled(Input).attrs({
  type: 'range',
})`
  margin-left: 0.75rem;
  flex: 1;
  width: 100%;
  background: rgb(218, 119, 242);
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  outline: none;
  overflow: hidden;
  border-radius: ${SLIDER_HEIGHT};

  &::-webkit-slider-runnable-track {
    height: ${SLIDER_HEIGHT};
    /* dark unfilled track, matching the original look (the old #ccc rule was
       never actually applied under styled-components 5) */
    background: #2b2b2b;
    border-radius: ${SLIDER_HEIGHT};
  }

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    height: ${SLIDER_HEIGHT};
    width: ${SLIDER_HEIGHT};
    background-color: #fff;
    border-radius: 50%;
    border: 1px solid ${INPUT_COLOR_HEX};
    box-shadow: -407px 0 0 400px ${INPUT_COLOR_HEX};
  }
`;
