import React, { useState, useEffect, useRef } from 'react';
import './PhoneInput.css';

export const COUNTRIES = [
  { code: 'BR', name: 'Brasil', ddi: '55', flag: '🇧🇷', mask: '(##) #####-####', placeholder: '(11) 99999-9999' },
  { code: 'US', name: 'Estados Unidos / Canadá', ddi: '1', flag: '🇺🇸', mask: '(###) ###-####', placeholder: '(202) 555-0123' },
  { code: 'PT', name: 'Portugal', ddi: '351', flag: '🇵🇹', mask: '### ### ###', placeholder: '912 345 678' },
  { code: 'ES', name: 'Espanha', ddi: '34', flag: '🇪🇸', mask: '### ### ###', placeholder: '612 345 678' },
  { code: 'GB', name: 'Reino Unido', ddi: '44', flag: '🇬🇧', mask: '#### ######', placeholder: '7911 123456' },
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
  { code: 'AU', name: 'Austrália', ddi: '61', flag: '🇦🇺', mask: '### ### ###', placeholder: '412 345 678' },
  { code: 'JP', name: 'Japão', ddi: '81', flag: '🇯🇵', mask: '## #### ####', placeholder: '90 1234 5678' },
  { code: 'OTHER', name: 'Outro Internacional', ddi: '', flag: '🌐', mask: '################', placeholder: 'Número completo com DDI' }
];

export function applyMask(digits, mask) {
  if (!mask || mask.includes('####') && !mask.includes('(')) {
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
  // Se sobrarem dígitos (ex: 9º dígito no Brasil), adiciona ao final
  if (dIdx < digits.length) {
    result += digits.slice(dIdx);
  }
  return result;
}

export function detectCountryFromPhone(phoneStr) {
  if (!phoneStr) return COUNTRIES[0]; // Padrão Brasil
  const clean = String(phoneStr).trim();
  const digitsOnly = clean.replace(/\D/g, '');

  if (clean.startsWith('+')) {
    // Tenta encontrar por DDI decrescente (3 dígitos, depois 2, depois 1)
    for (let len = 3; len >= 1; len--) {
      const prefix = digitsOnly.slice(0, len);
      const match = COUNTRIES.find(c => c.ddi === prefix);
      if (match) return match;
    }
  }

  // Se já começar com DDI conhecido mesmo sem o +
  for (let len = 3; len >= 1; len--) {
    const prefix = digitsOnly.slice(0, len);
    const match = COUNTRIES.find(c => c.ddi === prefix && c.code !== 'US'); // evita que qualquer número começando com 1 vire US
    if (match && digitsOnly.length >= 10) return match;
  }

  return COUNTRIES[0]; // fallback Brasil
}

export default function PhoneInput({
  value = '',
  onChange,
  placeholder,
  disabled = false,
  autoFocus = false,
  className = '',
  id
}) {
  const [selectedCountry, setSelectedCountry] = useState(() => detectCountryFromPhone(value));
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

    const country = detectCountryFromPhone(value);
    setSelectedCountry(country);

    let digits = String(value).replace(/\D/g, '');
    if (country.ddi && digits.startsWith(country.ddi)) {
      digits = digits.slice(country.ddi.length);
    }

    // Se for Brasil e vier com 11 dígitos começando com 55 ou sem
    if (country.code === 'BR') {
      const formatted = applyMask(digits, digits.length <= 10 ? '(##) ####-####' : '(##) #####-####');
      setNationalNumber(formatted);
    } else {
      setNationalNumber(applyMask(digits, country.mask));
    }
  }, [value]);

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
      const detected = detectCountryFromPhone(raw);
      setSelectedCountry(detected);
      let digits = raw.replace(/\D/g, '');
      if (detected.ddi && digits.startsWith(detected.ddi)) {
        digits = digits.slice(detected.ddi.length);
      }
      const formatted = applyMask(digits, detected.mask);
      setNationalNumber(formatted);

      const e164 = digits ? `+${detected.ddi}${digits}` : '';
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

    // Constrói o valor E.164 canônico universal
    const e164 = digits ? (selectedCountry.ddi ? `+${selectedCountry.ddi}${digits}` : `+${digits}`) : '';
    if (onChange) {
      onChange(e164, formatted);
    }
  };

  const handleSelectCountry = (country) => {
    setSelectedCountry(country);
    setIsDropdownOpen(false);

    // Re-mascara o número atual para as regras do novo país
    const digits = nationalNumber.replace(/\D/g, '');
    let maskToUse = country.mask;
    if (country.code === 'BR') {
      maskToUse = digits.length <= 10 ? '(##) ####-####' : '(##) #####-####';
    }
    const formatted = applyMask(digits, maskToUse);
    setNationalNumber(formatted);

    const e164 = digits ? (country.ddi ? `+${country.ddi}${digits}` : `+${digits}`) : '';
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
