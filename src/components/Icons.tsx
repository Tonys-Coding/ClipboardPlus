import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const ClipboardIcon = (props: IconProps) => <IconBase {...props}><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4.5V3.8A1.8 1.8 0 0 1 10.8 2h2.4A1.8 1.8 0 0 1 15 3.8v.7M9 9h6M9 13h6M9 17h4" /></IconBase>;
export const PlusIcon = (props: IconProps) => <IconBase {...props}><path d="M12 5v14M5 12h14" /></IconBase>;
export const LinkIcon = (props: IconProps) => <IconBase {...props}><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" /></IconBase>;
export const SearchIcon = (props: IconProps) => <IconBase {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></IconBase>;
export const StarIcon = ({ fill = 'none', ...props }: IconProps) => <IconBase fill={fill} {...props}><path d="m12 2.8 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9L6.4 20l1.1-6.2L3 9.4l6.2-.9L12 2.8Z" /></IconBase>;
export const MoreIcon = (props: IconProps) => <IconBase {...props}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></IconBase>;
export const SettingsIcon = (props: IconProps) => <IconBase {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></IconBase>;
export const TrashIcon = (props: IconProps) => <IconBase {...props}><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" /></IconBase>;
export const EditIcon = (props: IconProps) => <IconBase {...props}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" /></IconBase>;
export const WandIcon = (props: IconProps) => <IconBase {...props}><path d="m15 4 5 5L9 20H4v-5L15 4ZM12.5 6.5l5 5M5 4v3M3.5 5.5h3M19 16v4M17 18h4" /></IconBase>;
export const CheckIcon = (props: IconProps) => <IconBase {...props}><path d="m5 12 4 4L19 6" /></IconBase>;
export const XIcon = (props: IconProps) => <IconBase {...props}><path d="M6 6l12 12M18 6 6 18" /></IconBase>;
export const PauseIcon = (props: IconProps) => <IconBase {...props}><path d="M9 5v14M15 5v14" /></IconBase>;
export const PlayIcon = (props: IconProps) => <IconBase {...props}><path d="m8 5 11 7-11 7V5Z" /></IconBase>;
export const EyeIcon = (props: IconProps) => <IconBase {...props}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></IconBase>;
export const CopyOriginalIcon = (props: IconProps) => <IconBase {...props}><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" /><path d="M12 12.5h4M12 16h3" /></IconBase>;
export const InfoIcon = (props: IconProps) => <IconBase {...props}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.6v.6" /></IconBase>;
export const RefreshIcon = (props: IconProps) => <IconBase {...props}><path d="M20 11a8 8 0 1 0-2.3 5.6" /><path d="M20 5v6h-6" /></IconBase>;
export const DownloadIcon = (props: IconProps) => <IconBase {...props}><path d="M12 4v11M8 11l4 4 4-4" /><path d="M5 19h14" /></IconBase>;
