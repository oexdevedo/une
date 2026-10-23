import React, { useState, useEffect, useRef } from 'react';
import './PhoneInput.css';

export const COUNTRIES = [
  { code: 'TH', name: 'Tailândia', ddi: '66', flag: '🇹🇭', mask: '### ### ####', placeholder: '081 234 5678' },
  { code: 'BR', name: 'Brasil', ddi: '55', flag: '🇧🇷', mask: '(##) #####-####', placeholder: '(11) 99999-9999' },
  { code: 'US', name: 'Estados Unidos / Canadá', ddi: '1', flag: '🇺🇸', mask: '(###) ###-####', placeholder: '(202) 555-0123' },
  { code: 'SG', name: 'Singapura', ddi: '65', flag: '🇸🇬', mask: '#### ####', placeholder: '8123 4567' },
  { code: 'MY', name: 'Malásia', ddi: '60', flag: '🇲🇾', mask: '## ### ####', placeholder: '12 345 6789' },
  { code: 'ID', name: 'Indonésia', ddi: '62', flag: '🇮🇩', mask: '### ### ####', placeholder: '812 345 6789' },
  { code: 'PH', name: 'Filipinas', ddi: '63', flag: '🇵🇭', mask: '### ### ####', placeholder: '917 123 4567' },
  { code: 'VN', name: 'Vietnã', ddi: '84', flag: '🇻🇳', mask: '### ### ####', placeholder: '912 345 678' },
  { code: 'KH', name: 'Camboja', ddi: '855', flag: '🇰🇭', mask: '## ### ###', placeholder: '12 345 678' },
  { code: 'LA', name: 'Laos', ddi: '856', flag: '🇱🇦', mask: '## ### ###', placeholder: '20 123 456' },
  { code: 'MM', name: 'Mianmar', ddi: '95', flag: '🇲🇲', mask: '## ### ####', placeholder: '9 123 4567' },
  { code: 'PT', name: 'Portugal', ddi: '351', flag: '🇵🇹', mask: '### ### ###', placeholder: '912 345 678' },
  { code: 'ES', name: 'Espanha', ddi: '34', flag: '🇪🇸', mask: '### ### ###', placeholder: '612 345 678' },
  { code: 'GB', name: 'Reino Unido', ddi: '44', flag: '🇬🇧', mask: '#### ######', placeholder: '7911 123456' },
  { code: 'CN', name: 'China', ddi: '86', flag: '🇨🇳', mask: '### #### ####', placeholder: '138 0013 8000' },
  { code: 'JP', name: 'Japão', ddi: '81', flag: '🇯🇵', mask: '## #### ####', placeholder: '90 1234 5678' },
  { code: 'KR', name: 'Coreia do Sul', ddi: '82', flag: '🇰🇷', mask: '## #### ####', placeholder: '10 1234 5678' },
  { code: 'IN', name: 'Índia', ddi: '91', flag: '🇮🇳', mask: '##### #####', placeholder: '98765 43210' },
  { code: 'AU', name: 'Austrália', ddi: '61', flag: '🇦🇺', mask: '### ### ###', placeholder: '412 345 678' },
  { code: 'AR', name: 'Argentina', ddi: '54', flag: '🇦🇷', mask: '(##) ####-####', placeholder: '(11) 4567-8901' },
  { code: 'MX', name: 'México', ddi: '52', flag: '🇲🇽', mask: '(##) ####-####', placeholder: '(55) 1234-5678' },
  { code: 'CL', name: 'Chile', ddi: '56', flag: '🇨🇱', mask: '# #### ####', placeholder: '9 1234 5678' },
  { code: 'CO', name: 'Colômbia', ddi: '57', flag: '🇨🇴', mask: '### ### ####', placeholder: '300 123 4567' },
  { code: 'UY', name: 'Uruguai', ddi: '598', flag: '🇺🇾', mask: '## ### ###', placeholder: '99 123 456' },
  { code: 'PY', name: 'Paraguai', ddi: '595', flag: '🇵🇾', mask: '(###) ###-###', placeholder: '(981) 123-456' },
  { code: 'FR', name: 'França', ddi: '33', flag: '🇫🇷', mask: '# ## ## ## ##', placeholder: '6 12 34 56 78' },
  { code: 'DE', name: 'Alemanha', ddi: '49', flag: '🇩🇪', mask: '#### #######', placeholder: '1512 3456789' },
  { code: 'IT', name: 'Itália', ddi: '39', flag: '🇮🇹', mask: '### #######', placeholder: '320 1234567' },
  { code: 'AO', name: 'Angola', ddi: '244', flag: '🇦🇴', mask: '### ### ###', placeholder: '923 123 456' },
  { code: 'MZ', name: 'Moçambique', ddi: '258', flag: '🇲🇿', mask: '## ### ####', placeholder: '84 123 4567' },
  { code: 'CH', name: 'Suíça', ddi: '41', flag: '🇨🇭', mask: '## ### ## ##', placeholder: '79 123 45 67' },
  { code: 'OTHER', name: 'Outro Internacional', ddi: '', flag: '🌐', mask: '################', placeholder: 'Número completo com DDI' }
];

export function applyMask(digits, mask) {
  if (!mask || (mask.includes('####') && !mask.includes('('))) {
    return digits;
  }
  let result = '';
  let dIdx = 0;
  for (let i = 0; i < mask.length && dIdx < digits.length; i++) {
    if (mask[i] === '#') {
      result += digits[dIdx++];
    } else {
      result += mask[i];
    }
  }
  if (dIdx < digits.length) {
    result += digits.slice(dIdx);
  }
  return result;
}

export function detectCountryFromPhone(phoneStr, defaultCountry = 'TH') {
  const fallback = COUNTRIES.find(c => c.code === defaultCountry) || COUNTRIES[0];
  if (!phoneStr) return fallback;
  const clean = String(phoneStr).trim();
  const digitsOnly = clean.replace(/\D/g, '');

  if (clean.startsWith('+')) {
    for (let len = 3; len >= 1; len--) {
      const prefix = digitsOnly.slice(0, len);
      const match = COUNTRIES.find(c => c.ddi === prefix);
      if (match) return match;
    }
  }

  // Tailândia: 66 com 10 a 12 dígitos
  if (digitsOnly.startsWith('66') && digitsOnly.length >= 10 && digitsOnly.length <= 12) {
    const th = COUNTRIES.find(c => c.code === 'TH');
    if (th) return th;
  }

  // Brasil: 55 com 12 ou 13 dígitos
  if (digitsOnly.startsWith('55') && (digitsOnly.length === 12 || digitsOnly.length === 13)) {
    const br = COUNTRIES.find(c => c.code === 'BR');
    if (br) return br;
  }

  // Padrão doméstico da Tailândia: celular começa com 08, 09, 06 (10 dígitos) ou fixo 02, 03... (9 dígitos)
  if (digitsOnly.startsWith('0') && (digitsOnly.length === 9 || digitsOnly.length === 10)) {
    const th = COUNTRIES.find(c => c.code === 'TH');
    if (th) return th;
  }

  // Celular da Tailândia sem o 0: 9 dígitos iniciando em 8, 9 ou 6
  if (digitsOnly.length === 9 && ['8', '9', '6'].includes(digitsOnly[0])) {
    const th = COUNTRIES.find(c => c.code === 'TH');
    if (th) return th;
  }

  // Se já começar com DDI conhecido mesmo sem o +
  for (let len = 3; len >= 1; len--) {
    const prefix = digitsOnly.slice(0, len);
    const match = COUNTRIES.find(c => c.ddi === prefix && c.code !== 'US');
    if (match && digitsOnly.length >= 10) return match;
  }

  return fallback;
}

export function buildE164Phone(country, rawDigits) {
  if (!rawDigits) return '';
  let digits = String(rawDigits).replace(/\D/g, '');
  if (!digits) return '';

  // Para Tailândia, remove o 0 de tronco inicial ao compor o padrão E.164 internacional (+66...)
  if (country.code === 'TH' && digits.startsWith('0')) {
    digits = digits.replace(/^0+/, '');
  }

  if (!country.ddi) return `+${digits}`;
  return `+${country.ddi}${digits}`;
}

export default function PhoneInput({
  value = '',
  onChange,
  defaultCountry = 'TH',
  placeholder,
  disabled = false,
  autoFocus = false,
  className = '',
  id
}) {
  const [selectedCountry, setSelectedCountry] = useState(() => detectCountryFromPhone(value, defaultCountry));
  const [nationalNumber, setNationalNumber] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Sincroniza valor recebido de fora
  useEffect(() => {
    if (!value) {
      setNationalNumber('');
      return;
    }

    const country = detectCountryFromPhone(value, defaultCountry);
    setSelectedCountry(country);

    let digits = String(value).replace(/\D/g, '');
    if (country.ddi && digits.startsWith(country.ddi)) {
      digits = digits.slice(country.ddi.length);
    }

    if (country.code === 'BR') {
      const formatted = applyMask(digits, digits.length <= 10 ? '(##) ####-####' : '(##) #####-####');
      setNationalNumber(formatted);
    } else if (country.code === 'TH') {
      // Se na Tailândia tiver 9 dígitos (ex: 812345678), formata nacionalmente com 0 na frente
      if (digits.length === 9 && (digits.startsWith('8') || digits.startsWith('9') || digits.startsWith('6'))) {
        digits = '0' + digits;
      }
      setNationalNumber(applyMask(digits, country.mask));
    } else {
      setNationalNumber(applyMask(digits, country.mask));
    }
  }, [value, defaultCountry]);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isDropdownOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    } else {
      setSearchQuery('');
    }
  }, [isDropdownOpen]);

  const handleInputChange = (e) => {
    let raw = e.target.value;

    // Se o usuário colou ou digitou um número com '+' internacional
    if (raw.trim().startsWith('+')) {
      const detected = detectCountryFromPhone(raw, defaultCountry);
      setSelectedCountry(detected);
      let digits = raw.replace(/\D/g, '');
      if (detected.ddi && digits.startsWith(detected.ddi)) {
        digits = digits.slice(detected.ddi.length);
      }
      if (detected.code === 'TH' && digits.length === 9 && (digits.startsWith('8') || digits.startsWith('9') || digits.startsWith('6'))) {
        digits = '0' + digits;
      }
      const formatted = applyMask(digits, detected.mask);
      setNationalNumber(formatted);

      const e164 = buildE164Phone(detected, digits);
      if (onChange) onChange(e164, formatted);
      return;
    }

    const digits = raw.replace(/\D/g, '');
    let maskToUse = selectedCountry.mask;
    if (selectedCountry.code === 'BR') {
      maskToUse = digits.length <= 10 ? '(##) ####-####' : '(##) #####-####';
    }

    const formatted = applyMask(digits, maskToUse);
    setNationalNumber(formatted);

    const e164 = buildE164Phone(selectedCountry, digits);
    if (onChange) {
      onChange(e164, formatted);
    }
  };

  const handleSelectCountry = (country) => {
    setSelectedCountry(country);
    setIsDropdownOpen(false);

    // Re-mascara o número atual para as regras do novo país
    let digits = nationalNumber.replace(/\D/g, '');
    let maskToUse = country.mask;
    if (country.code === 'BR') {
      maskToUse = digits.length <= 10 ? '(##) ####-####' : '(##) #####-####';
    } else if (country.code === 'TH' && digits.length === 9 && (digits.startsWith('8') || digits.startsWith('9') || digits.startsWith('6'))) {
      digits = '0' + digits;
    }
    const formatted = applyMask(digits, maskToUse);
    setNationalNumber(formatted);

    const e164 = buildE164Phone(country, digits);
    if (onChange) {
      onChange(e164, formatted);
    }
  };

  const filteredCountries = COUNTRIES.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.ddi.includes(q) || c.code.toLowerCase().includes(q);
  });

  return (
    <div className={`intl-phone-wrapper ${className}`} ref={dropdownRef}>
      <button
        type="button"
        className="intl-country-btn"
        onClick={() => !disabled && setIsDropdownOpen(!isDropdownOpen)}
        disabled={disabled}
        title={`País: ${selectedCountry.name} (+${selectedCountry.ddi})`}
      >
        <span className="intl-flag">{selectedCountry.flag}</span>
        <span className="intl-ddi">+{selectedCountry.ddi || '?'}</span>
        <span className="intl-arrow">▾</span>
      </button>

      <input
        id={id}
        type="tel"
        className="intl-phone-input"
        placeholder={placeholder || selectedCountry.placeholder}
        value={nationalNumber}
        onChange={handleInputChange}
        disabled={disabled}
        autoFocus={autoFocus}
      />

      {isDropdownOpen && (
        <div className="intl-country-dropdown animated-fade">
          <div className="intl-search-box">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Buscar país ou código..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="intl-country-list">
            {filteredCountries.map(c => (
              <div
                key={c.code}
                className={`intl-country-item ${selectedCountry.code === c.code ? 'selected' : ''}`}
                onClick={() => handleSelectCountry(c)}
              >
                <span className="item-flag">{c.flag}</span>
                <span className="item-name">{c.name}</span>
                <span className="item-ddi">{c.ddi ? `+${c.ddi}` : ''}</span>
              </div>
            ))}
            {filteredCountries.length === 0 && (
              <div className="intl-no-country">Nenhum país encontrado</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
