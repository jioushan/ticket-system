import { Select } from "@cloudflare/kumo";
import { useTranslation, type Locale } from "../i18n/I18nContext";

const localeOptions: { value: Locale; label: string }[] = [
  { value: "en", label: "ENG" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "ja", label: "JP" },
];

export default function LanguageSwitch() {
  const { locale, setLocale, t } = useTranslation();

  return (
    <Select
      size="sm"
      value={locale}
      onValueChange={(v) => { if (v) setLocale(v as Locale); }}
      aria-label={t("lang." + locale)}
    >
      {localeOptions.map((opt) => (
        <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>
      ))}
    </Select>
  );
}
