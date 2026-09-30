import type { CSSProperties } from "react";

export function Icon({
  name,
  size = 22,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  const paths: Record<string, React.ReactNode> = {
    today: (
      <>
        <path d="M8 3v3m8-3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
        <path d="m8 14 3 3 5-5" />
      </>
    ),
    home: (
      <>
        <path d="m3 10 9-7 9 7M5 9v11h14V9" />
        <path d="M9 20v-7h6v7" />
      </>
    ),
    me: (
      <>
        <circle cx="12" cy="7" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </>
    ),
    privacy: (
      <>
        <path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z" />
        <path d="m8 12 3 3 5-5" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-10v.1" />
      </>
    ),
    voice: (
      <>
        <path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M15 8V3H3v13h5" />
      </>
    ),
    leaf: (
      <>
        <path d="M20 3C8 2 2 9 6 16s16 1 14-13Z" />
        <path d="m4 21 11-12" />
      </>
    ),
    logout: (
      <>
        <path d="M9 3H4v18h5m5-14 5 5-5 5M8 12h12" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.info}
    </svg>
  );
}

export function HouseIllustration() {
  return (
    <svg
      className="house-art"
      viewBox="0 0 380 260"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="205" cy="128" r="107" fill="#fff" opacity=".09" />
      <circle cx="323" cy="53" r="12" fill="#91DCF5" />
      <path
        d="m45 90 8 8m0-8-8 8m290 82 8 8m0-8-8 8"
        stroke="#A7E5F7"
        strokeWidth="2"
      />
      <ellipse
        cx="199"
        cy="234"
        rx="141"
        ry="12"
        fill="#00558B"
        opacity=".45"
      />
      <path d="M99 121 193 46l94 75v109H99V121Z" fill="#E5F6FB" />
      <path
        d="m88 125 105-85 106 85"
        stroke="#B6E5F3"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M251 64V44h19v36" fill="#B6E5F3" />
      <rect x="164" y="152" width="54" height="78" rx="3" fill="#1681B8" />
      <circle cx="207" cy="190" r="3" fill="#C0EAF7" />
      <rect x="119" y="129" width="30" height="39" rx="3" fill="#74C7E4" />
      <path d="M134 130v38m-14-20h29" stroke="#E5F6FB" strokeWidth="3" />
      <rect x="235" y="129" width="30" height="39" rx="3" fill="#74C7E4" />
      <path d="M250 130v38m-14-20h29" stroke="#E5F6FB" strokeWidth="3" />
      <circle cx="193" cy="106" r="17" fill="#A9DFEF" />
      <path d="M193 91v30m-15-15h30" stroke="#E5F6FB" strokeWidth="3" />
      <path
        d="M69 231v-67m0 37c-33-1-29-28-29-28 30 0 29 28 29 28Zm0-18s-1-28 25-31c4 26-25 31-25 31Z"
        stroke="#8BD1B9"
        strokeWidth="5"
        fill="#8BD1B9"
        strokeLinejoin="round"
      />
      <path
        d="M303 231v-43m0 25s-23-3-24-22c23-2 24 22 24 22Zm0-13s1-24 24-26c1 21-24 26-24 26Z"
        stroke="#8BD1B9"
        strokeWidth="5"
        fill="#8BD1B9"
        strokeLinejoin="round"
      />
      <path d="M57 214h25l-4 21H61l-4-21Z" fill="#CCEDE5" />
      <path
        d="m190 72 3 3 3-3c9-7 17 7-3 18-20-11-12-25-3-18Z"
        fill="#FFBB9D"
      />
    </svg>
  );
}
