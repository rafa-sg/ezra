import { useId } from "react";
import type { Post } from "@/lib/model";

export function Artwork({
  scene = "coast",
  className = "",
}: {
  scene?: Post["artwork"];
  className?: string;
}) {
  const uid = useId().replaceAll(":", "");
  return (
    <svg
      className={`artwork ${className}`}
      viewBox="0 0 640 420"
      role="img"
      aria-label={`Ilustración conceptual: ${{ coast: "costa", volcano: "montañas", town: "pueblo", coffee: "café" }[scene]}. No es una fotografía.`}
    >
      <defs>
        <linearGradient id={`${uid}-sky`} x2="0" y2="1">
          <stop
            stopColor={
              scene === "coast"
                ? "#c4e2e0"
                : scene === "volcano"
                  ? "#d4e0cd"
                  : scene === "town"
                    ? "#efdbc2"
                    : "#d8c6ac"
            }
          />
          <stop offset="1" stopColor="#f6ead3" />
        </linearGradient>
        <filter id={`${uid}-grain`}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency=".7"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope=".055" />
          </feComponentTransfer>
          <feBlend in="SourceGraphic" mode="multiply" />
        </filter>
      </defs>
      <g filter={`url(#${uid}-grain)`}>
        <path fill={`url(#${uid}-sky)`} d="M0 0h640v420H0z" />
        {scene === "coast" ? (
          <>
            <circle cx="449" cy="95" r="43" fill="#fff4c8" />
            <path d="M0 147Q125 112 240 171T440 170T640 136V420H0" fill="#77aaa1" />
            <path d="M0 185Q134 173 227 229T460 240T640 224V420H0" fill="#4a8a80" />
            <path d="M0 240Q142 180 221 301T466 327T640 309V420H0" fill="#ece0b9" />
            <path
              d="M0 232Q139 177 227 292T468 317T640 301"
              fill="none"
              stroke="#f6f4dc"
              strokeWidth="13"
            />
            <path
              d="M315 152q52-15 115 1m-320 21q39-13 90 1m225 54q69-12 133 1m-222-35q32-9 54-2"
              stroke="#b7dbca"
              strokeWidth="3"
              fill="none"
              opacity=".7"
            />
            <path d="M45 420q49-190 109-290" fill="none" stroke="#415e47" strokeWidth="13" />
            <path
              d="M153 132Q52 37 13 144Q95 101 153 132M153 132Q103 24 200 28Q165 65 153 132M153 132Q241 20 300 83Q215 83 153 132M153 132Q285 96 274 186Q219 143 153 132M153 132Q215 190 169 246Q175 179 153 132"
              fill="#416b51"
            />
            <path
              d="M573 420l-23-90m20 37q-42-15-59 3m50-18q37-34 65-24"
              stroke="#688363"
              strokeWidth="10"
              fill="none"
            />
            <path
              d="M445 100l9-4 8 4m-114-34l9-4 8 4"
              fill="none"
              stroke="#6f8a7b"
              strokeWidth="2"
            />
          </>
        ) : scene === "volcano" ? (
          <>
            <circle cx="161" cy="91" r="38" fill="#fff1c7" />
            <path d="M0 243L120 134l130 106L393 60l158 173 89-42v229H0" fill="#94aa86" />
            <path d="M135 307L365 102l65 54 49 12 125 203 36 49H0" fill="#5a7960" />
            <path d="M267 190l98-88 65 54 49 12-114-16z" fill="#345b50" />
            <path d="M0 290Q106 229 240 331T640 308V420H0" fill="#365c4b" />
            <path d="M0 365q130-94 282 4t358-31v82H0" fill="#223f36" />
            <path d="M228 420q155-50 101-95t38-72" fill="none" stroke="#b4b58a" strokeWidth="13" />
            <path d="M80 301l15-65 15 65zm425 17l17-79 17 79zm57 29l14-71 14 71z" fill="#26483e" />
            <path
              d="M304 82q43-22 86 0m-69-20q39-12 58 0"
              fill="none"
              stroke="#f5eedb"
              strokeWidth="8"
              opacity=".6"
            />
          </>
        ) : scene === "town" ? (
          <>
            <circle cx="495" cy="82" r="38" fill="#fff4cd" />
            <path d="M0 201q111-62 231-26t231-16 178 23v238H0" fill="#afba98" />
            <path d="M0 262h640v158H0" fill="#d1ae86" />
            <path d="M271 233h106l181 187H88z" fill="#e9d6b9" />
            <path d="M0 181h225v172H0" fill="#d88460" />
            <path d="M0 180l112-51 132 51z" fill="#875b48" />
            <path d="M391 198h249v157H391" fill="#e8ba63" />
            <path d="M379 198l139-46 122 24v22" fill="#8a584b" />
            <path d="M254 148h112v123H254" fill="#f1e7d0" />
            <path d="M244 148l65-45 66 45" fill="#a76450" />
            <path d="M286 112V74h47v38" fill="#f5ead1" />
            <path d="M280 74l30-21 30 21" fill="#a76450" />
            <path d="M305 43h10v24h-10zm-7 8h24v6h-24" fill="#88654e" />
            <path d="M293 271v-42a17 17 0 0 1 34 0v42" fill="#706b5c" />
            <g fill="#537d72">
              <path d="M33 240h44v67H33zm77 0h44v67h-44zm349-8h43v68h-43zm79 0h43v68h-43z" />
            </g>
            <path d="M180 353v-62a20 20 0 0 1 40 0v62" fill="#795345" />
            <g stroke="#c2aa8b" strokeWidth="3">
              <path d="M219 325h181m-218 38h255m-95-77l30 134m-77-134l-23 134" />
            </g>
            <path d="M582 376v-99" stroke="#735d44" strokeWidth="9" />
            <circle cx="582" cy="251" r="52" fill="#688561" />
            <circle cx="606" cy="233" r="34" fill="#799467" />
          </>
        ) : (
          <>
            <path d="M0 265L640 155v265H0" fill="#ad815c" />
            <ellipse cx="317" cy="323" rx="187" ry="47" fill="#855f43" opacity=".35" />
            <ellipse cx="317" cy="299" rx="158" ry="57" fill="#ebdfc7" />
            <ellipse cx="316" cy="293" rx="115" ry="35" fill="#c9b89a" />
            <path d="M233 167h165v101q-14 48-83 48t-82-48z" fill="#f4eddc" />
            <path
              d="M398 184q75-10 57 55-11 30-57 31"
              stroke="#f4eddc"
              strokeWidth="19"
              fill="none"
            />
            <ellipse cx="315" cy="168" rx="83" ry="31" fill="#d6c3a3" />
            <ellipse cx="315" cy="172" rx="70" ry="23" fill="#725239" />
            <path
              d="M278 109q-21-19 2-43m39 58q-22-28 4-57m30 43q-19-19 1-39"
              stroke="#f6ebd7"
              strokeWidth="7"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M55 302q43-78 56-216m-12 91q-79-52-86-8 32 48 86 8m-1 9q83-75 108-28-29 51-108 28m-9 53q-88-47-80 1 29 42 80-1m13-97q-20-87 23-86 37 22-23 86"
              fill="#586948"
              stroke="#586948"
              strokeWidth="5"
            />
            <g fill="#60452f" transform="rotate(-25 486 345)">
              <ellipse cx="482" cy="340" rx="12" ry="20" />
              <ellipse cx="520" cy="367" rx="11" ry="17" />
              <ellipse cx="452" cy="380" rx="10" ry="16" />
            </g>
          </>
        )}
      </g>
    </svg>
  );
}
