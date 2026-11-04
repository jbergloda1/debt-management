import { newId } from '../../domain/defaults';
import type {
  CreditCardObligation,
  InstallmentLoanObligation,
  Institution,
  ISODate,
  ObligationKind,
} from '../../domain/types';

/** Mục 15 — preset là JSON chia sẻ được, không phải code. */
export interface InstitutionPreset {
  key: string;
  displayName: string;
  country: string;
  version: number;
  institution: Omit<Institution, 'id'>;
  obligationTemplates: {
    label: string;
    kind: ObligationKind;
    defaults: Partial<InstallmentLoanObligation | CreditCardObligation>;
  }[];
  source?: string;
  verifiedAt?: ISODate;
}

const files = import.meta.glob<InstitutionPreset>('./*.json', { eager: true, import: 'default' });

export const builtinPresets: InstitutionPreset[] = Object.values(files).sort((a, b) => a.displayName.localeCompare(b.displayName));

export function isPreset(x: any): x is InstitutionPreset {
  return !!x && typeof x.key === 'string' && typeof x.displayName === 'string' && !!x.institution && Array.isArray(x.obligationTemplates);
}

/** Tạo institution mới từ preset (người dùng sửa được mọi tham số sau đó). */
export function institutionFromPreset(p: InstitutionPreset, name?: string): Institution {
  return { ...structuredClone(p.institution), id: newId('inst'), name: name ?? p.institution.name, presetKey: p.key };
}

/** Xuất cấu hình institution thành preset — không kèm số tiền hay dữ liệu cá nhân. */
export function presetFromInstitution(inst: Institution): InstitutionPreset {
  const { id: _id, note: _note, presetKey: _pk, ...rest } = inst;
  return {
    key: `user-${inst.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}`,
    displayName: inst.name,
    country: 'VN',
    version: 1,
    institution: rest,
    obligationTemplates: [],
    source: 'do người dùng đóng góp',
  };
}
