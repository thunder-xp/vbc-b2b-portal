# Business phone state machine

Supabase Auth owns Business phone identity. `auth.users.phone` with a non-null
`phone_confirmed_at` is the verified quick-login identity. `auth.users.phone_change`
is the pending verification target. `user_profiles.phone` is the portal contact
projection and changes only after Auth confirms the same canonical phone.

The enrollment target comes from the current submitted profile value. The server
canonicalizes it once and binds the challenge to its keyed hash and last-three-digit
suffix. The verification page, resend, SMS hook, and completion path resolve the
target from the challenge plus Auth pending state; they never choose a target by
rereading `user_profiles.phone`. A target mismatch fails closed with
`BUSINESS_PHONE_TARGET_MISMATCH` before provider dispatch.

The user-visible states are:

- `NO_PHONE`: neither a verified Auth phone nor a usable profile projection exists.
- `PHONE_VERIFICATION_REQUIRED`: a profile phone exists and needs a new challenge.
- `OTP_SENT`: an initial enrollment challenge is active for the Auth pending phone.
- `VERIFIED`: Auth and the profile projection contain the same confirmed phone.
- `PHONE_CHANGE_PENDING`: a challenge is active for a new phone while the old
  verified phone remains active.
- `VERIFICATION_FAILED`: the latest challenge failed or expired.
- `CONFLICT`: another operational identity owns or is verifying the target.

Only one effective Business phone target may exist for an Auth user. Starting a
different target serializes on the user, marks earlier unverified challenges as
superseded, clears only their unverified pending Auth state, and creates the new
challenge. Repeating the same target reuses the live challenge and keeps send and
verification limits bounded.

Completion first verifies that Auth contains the challenge target with a non-null
confirmation timestamp. It then updates `user_profiles.phone` and marks the
challenge verified in one database transaction. Repeated completion calls are
successful only while Auth, profile, and challenge still agree.
