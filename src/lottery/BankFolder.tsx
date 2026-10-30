import type { LotteryOrganization } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes";
export function BankFolder({
  organization,
  value,
  onChange,
}: Readonly<{
  organization: LotteryOrganization;
  value: string;
  onChange: (value: string) => void;
}>) {
  if (!organization.paymentOptions?.bankChannels.length) return null;
  return (
    <label>
      Bank
      <select
        aria-label="Bank folder"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Bank</option>
        {organization.paymentOptions.bankChannels.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
