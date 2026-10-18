"use client";

import { startTransition, type FormEvent } from "react";

/**
 * Submit a form to a server action without React's automatic form reset. Use it for forms with
 * controlled fields (selects, rows held in state): after a validation error the reset would blank
 * the DOM while React's state kept the old values, wiping the user's work and submitting empty fields.
 */
export function submitWithoutReset(dispatch: (data: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(data));
  };
}
