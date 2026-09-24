import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { projectPositionSizePlan, type PositionSizeField, type PositionSizeProblem, type PositionSizeProblemReason } from '../../application/learn/positionSizePlan';
import { Field } from '../../design-system/primitives';
import { LearnPicture } from './LearnPicture';
import './learn.css';

const POSITION_SIZE_FIELDS: readonly { readonly field: PositionSizeField; readonly label: string; readonly hint: string }[] = [
  { field: 'accountSize', label: 'Money in your account', hint: "In your account's currency, for example 1000." },
  { field: 'riskPercent', label: "Most you're willing to lose (%)", hint: 'Many traders risk 1% or less of their account on one trade.' },
  { field: 'entryPrice', label: 'Entry price', hint: 'The price where you plan to buy or sell.' },
  { field: 'stopPrice', label: 'Stop price', hint: 'Where you get out if the trade goes against you.' },
];

const FIELD_ERRORS: Readonly<Partial<Record<PositionSizeProblemReason, string>>> = {
  'not-a-number': 'Use digits and a dot, like 1000.50.',
  'must-be-positive': 'Use a number above 0.',
  'percent-over-100': 'Use 100 or less.',
  'stop-equals-entry': 'The stop must be a different price from the entry.',
};

function headlineProblem(problems: readonly PositionSizeProblem[]): string {
  if (problems.some((problem) => problem.reason === 'too-small')) return 'The amount you\'re willing to lose is too small for this stop: you could buy or sell less than 0.00000001.';
  if (problems.some((problem) => problem.reason === 'calculation-failed')) return 'Kairos could not work this out.';
  if (problems.every((problem) => problem.reason === 'missing')) return 'Fill in all four boxes to see the answer.';
  return 'Check the boxes marked above.';
}

function PositionSizeCalculator() {
  const titleId = useId();
  const [input, setInput] = useState<Readonly<Record<PositionSizeField, string>>>({ accountSize: '', riskPercent: '', entryPrice: '', stopPrice: '' });
  const result = useMemo(() => projectPositionSizePlan(input), [input]);
  const errorOf = (field: PositionSizeField): string | undefined => {
    if (result.ok || input[field].trim() === '') return undefined;
    const problem = result.problems.find((item) => item.field === field);
    return problem ? FIELD_ERRORS[problem.reason] : undefined;
  };

  return (
    <section className="kairos-calculator" aria-labelledby={titleId}>
      <h2 id={titleId}>How much can I buy?</h2>
      <p>Enter your money, how much of it you're willing to lose, and where you plan to get in and where you get out if you're wrong.</p>
      <div className="kairos-calculator__fields">
        {POSITION_SIZE_FIELDS.map(({ field, label, hint }) => (
          <Field key={field} label={label} hint={hint} error={errorOf(field)}>
            {(control) => <input {...control} inputMode="decimal" autoComplete="off" value={input[field]} onChange={(event) => setInput((current) => ({ ...current, [field]: event.target.value }))} />}
          </Field>
        ))}
      </div>
      <p className="kairos-calculator__headline" aria-live="polite">
        {result.ok ? <>{result.plan.side === 'long' ? 'You can buy up to' : 'You can sell up to'} <strong>{result.plan.size}</strong></> : headlineProblem(result.problems)}
      </p>
      {result.ok ? (
        <>
          <LearnPicture spec={result.plan.picture} labels={{ risk: `Lose ${result.plan.amountAtRisk}` }} title={`If the price reaches your stop at ${result.plan.stopPrice}, you lose ${result.plan.amountAtRisk}.`} />
          <ul className="kairos-calculator__details">
            <li>If the price reaches your stop, you lose {result.plan.amountAtRisk}.</li>
            <li>The most you chose to lose: {result.plan.riskBudget} ({result.plan.riskPercent}% of {result.plan.accountSize}).</li>
            <li>At your entry price this trade is worth {result.plan.positionValue}.</li>
            {result.plan.needsBorrowedMoney ? <li>That is more than the money in your account, so you would need borrowed money (leverage) for it.</li> : null}
            <li>{result.plan.side === 'long' ? 'Your stop is below your entry, so this is a buy (long) trade.' : 'Your stop is above your entry, so this is a sell (short) trade.'}</li>
            {result.plan.sizeWasRounded ? <li>The size is rounded down to 8 decimal places, so the loss at your stop is never more than you chose. Your exchange may only allow bigger steps.</li> : null}
            <li>Fees are not included.</li>
          </ul>
        </>
      ) : null}
    </section>
  );
}

/** Calculators: work out a trade before placing it, as a picture plus the exact numbers. Nothing is saved. */
export function CalculatorsScreen() {
  return (
    <section className="kairos-route kairos-learn" aria-labelledby="kairos-calculators-title">
      <Link className="kairos-learn__back" to="/library">Back to the Library</Link>
      <h1 id="kairos-calculators-title">Calculators</h1>
      <p>Work out a trade before you place it. Nothing you type here is saved.</p>
      <PositionSizeCalculator />
    </section>
  );
}
