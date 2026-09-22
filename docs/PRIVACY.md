# Privacy Policy — Tbilisi Quest

**Last updated: 22 September 2026**

> **This is a working draft, not legal advice.** It accurately describes what
> the app as built actually collects, which is the hard part and the part a
> lawyer cannot do for you. Have a Georgian lawyer review it before you publish
> — particularly the sections on minors and on the Law of Georgia on Personal
> Data Protection, which was substantially amended in 2024 and now carries
> notification duties this document does not attempt to cover.
>
> Publish this at a stable public URL (Play Store requires one) and link it from
> the app's sign-up screen.

Tbilisi Quest ("the app") is operated by **Gridly LLC** ("we", "us"), Tbilisi,
Georgia. Contact: **[your support email]**.

This policy explains what we collect, why, how long we keep it, and what you can
ask us to do about it.

---

## 1. What we collect

**Account**
- Email address and password — handled by our authentication provider
  (Supabase). We never see your password.
- Display name.
- Language preference.
- **Date of birth.** Collected once, at first launch. We store the date rather
  than your age so that access that depends on age updates itself.
- For players under 16: a record that you confirmed a parent or guardian knows
  you use the app, and when.

**Location**
- Your device's position while the app is open, used to show nearby drops and to
  confirm you are physically at a venue when you claim or redeem a voucher.
- Your last known position, stored on your account to load the map faster.
- The position recorded at the moment you redeem a voucher, and its distance
  from the venue. This is kept as fraud evidence — it is the only thing that
  distinguishes a real visit from a faked one.
- The position attached to a safety or venue report, if you send one.

We do **not** track your location in the background. When the app is closed, we
receive nothing.

**Activity**
- Vouchers you claim and redeem, and when.
- Which drops appeared on your map and which you came close to. This is how
  merchants learn whether an offer brought anyone in.
- XP, level, streak, quests, badges and season progress.
- Who invited you, if you entered a referral code, and who you invited.

**Notifications**
- A push token identifying your device, if you allow notifications. You can
  revoke this in your phone's settings at any time.

**Reports**
- Anything you write in a safety or venue report, along with your account and
  position.

We do not collect your contacts, your photos, your browsing, or any advertising
identifier. There is no advertising SDK and no analytics SDK in this app.

---

## 2. Why we collect it

| Purpose | Data used |
|---|---|
| Show drops near you | Live location |
| Prove you are at the venue when claiming or redeeming | Live location, distance to venue |
| Prevent fraud and location spoofing | Redemption position, distance, claim history |
| Age-appropriate access | Date of birth |
| Merchant reporting | Aggregated impressions, claims, redemptions |
| Notify you when drops go live | Push token, language |
| Safety | Reports, and the position attached to them |

Merchants see **aggregate numbers only** — how many people saw an offer, came
close, claimed, and redeemed. A merchant cannot see your name, your email, your
location history, or which individual player did what.

---

## 3. Who else sees it

- **Supabase** — our database and authentication provider, which stores the
  data described above.
- **Expo** — delivers push notifications. It receives your push token and the
  text of the notification, nothing else.
- **Google (Firebase Cloud Messaging)** — required for notifications to reach
  Android devices.
- **CARTO / OpenStreetMap** — supply map tiles. Your device requests tiles from
  them directly; they do not receive your account or your exact position.

We do not sell your data. We do not share it with advertisers. We share it with
law enforcement only where Georgian law requires it.

---

## 4. Players under 18

The app is for ages **13 and over**. Accounts for anyone younger are refused.

If you are **13 to 15**, we ask you to confirm that a parent or guardian knows
you use the app. This is an acknowledgement you give us, not verified parental
consent — we have no way to verify a parent, and we would rather say so than
imply a check we do not perform.

Features that would place you in a group with people you have not met are
restricted to **16 and over**.

A parent or guardian may contact us at **[your support email]** to see what we
hold about their child's account, or to have it deleted. We will act on such a
request within 30 days.

---

## 5. How long we keep it

- **Account data** — until you delete your account.
- **Redemption records, including the position** — 24 months. These are the
  merchant's proof that a discount was genuinely used and our evidence in a
  fraud dispute.
- **Map impressions** — 12 months, then deleted.
- **Notification records** — 14 days.
- **Safety reports** — 24 months.

Deleting your account removes your profile, location, push token and referral
links. Redemption records are retained for the period above in a form that no
longer identifies you, because a merchant's settled accounts cannot be unwound
by a player deleting an app.

---

## 6. Your rights

Under Georgian data protection law you may ask us to:

- tell you what we hold about you;
- correct anything wrong;
- delete your account and data;
- give you a copy of your data in a portable form;
- stop processing your data.

Write to **[your support email]**. We will respond within 30 days and will not
charge you for it.

You may also complain to the **Personal Data Protection Service of Georgia**
(personaldata.ge).

---

## 7. Security

Access to your data is enforced in the database itself, not only in the app:
every table carries row-level security policies, so one player cannot read
another's vouchers, position or account even by calling our API directly.
Merchant staff can only read data for venues they are assigned to.

No system is perfect. If we discover a breach affecting your data, we will tell
you and the Personal Data Protection Service as the law requires.

---

## 8. Changes

If we change this policy in a way that affects what we collect or why, we will
tell you in the app before the change takes effect.
