'use client';

import { INDIAN_STATES } from '@noors/shared';
import { SelectField, TextField } from './form';

export interface AddressDraft {
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
}

export const emptyAddress: AddressDraft = {
  name: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  pincode: '',
};

/** Name, phone and Indian postal address. `errorFor` maps a field to its server message. */
export function AddressForm({
  value,
  onChange,
  errorFor,
  disabled,
}: {
  value: AddressDraft;
  onChange: (next: AddressDraft) => void;
  errorFor: (field: keyof AddressDraft) => string | undefined;
  disabled?: boolean;
}) {
  const field = (key: keyof AddressDraft) => ({
    value: value[key],
    onChange: (e: { target: { value: string } }) => onChange({ ...value, [key]: e.target.value }),
    error: errorFor(key),
    disabled,
  });

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <TextField
        label="Full name"
        autoComplete="name"
        required
        maxLength={100}
        {...field('name')}
      />
      <TextField
        label="Mobile number"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        required
        maxLength={16}
        hint="For delivery updates from the courier."
        {...field('phone')}
      />
      <TextField
        label="House, building and street"
        autoComplete="address-line1"
        required
        maxLength={200}
        className="sm:col-span-2"
        {...field('line1')}
      />
      <TextField
        label="Area or landmark (optional)"
        autoComplete="address-line2"
        maxLength={200}
        className="sm:col-span-2"
        {...field('line2')}
      />
      <TextField
        label="Pincode"
        inputMode="numeric"
        autoComplete="postal-code"
        required
        maxLength={6}
        {...field('pincode')}
      />
      <TextField
        label="City"
        autoComplete="address-level2"
        required
        maxLength={100}
        {...field('city')}
      />
      <SelectField
        label="State"
        autoComplete="address-level1"
        required
        className="sm:col-span-2"
        {...field('state')}
      >
        <option value="" disabled>
          Choose a state
        </option>
        {INDIAN_STATES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </SelectField>
    </div>
  );
}
