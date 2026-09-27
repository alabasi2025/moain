#!/usr/bin/env bash
# =====================================================================
#  تركيب سيرفر البث الخاص لمنصة إضاءات (Jitsi Meet عبر Docker + JWT)
#  على سيرفر سحابي Ubuntu 22.04/24.04 (مثال: Contabo Cloud VPS 4 أنوية / 8GB)
#
#  الاستخدام (كمستخدم root على السيرفر):
#     curl -fsSL <raw-url>/deploy/jitsi/install.sh -o install.sh
#     DOMAIN=meet.example.com EMAIL=you@example.com bash install.sh
#
#  قبل التشغيل: أضف سجل DNS من نوع A للنطاق يشير إلى IP السيرفر.
#  في النهاية يطبع السكربت JITSI_APP_SECRET — ضعه في Cloudflare:
#     wrangler pages secret put JITSI_APP_SECRET
#  وضع JITSI_DOMAIN=meet.example.com في متغيرات المشروع.
# =====================================================================
set -euo pipefail

DOMAIN="${DOMAIN:?حدد النطاق: DOMAIN=meet.example.com}"
EMAIL="${EMAIL:?حدد البريد لشهادة SSL: EMAIL=you@example.com}"
APP_ID="${APP_ID:-edaat}"
TZ_NAME="${TZ_NAME:-Asia/Riyadh}"
DIR=/opt/jitsi
CFG=/opt/jitsi-cfg

log() { printf '\n\033[1;35m▶ %s\033[0m\n' "$*"; }
[[ $EUID -eq 0 ]] || { echo "شغّل السكربت كـ root (sudo -i)"; exit 1; }

log "1/7 تحديث النظام وتثبيت الأدوات"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl unzip ufw fail2ban unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades || true
timedatectl set-timezone "$TZ_NAME" || true

log "2/7 تثبيت Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

log "3/7 الجدار الناري (SSH + الويب + وسائط البث)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 10000/udp
ufw --force enable

log "4/7 تحميل آخر إصدار مستقر من docker-jitsi-meet"
mkdir -p "$DIR" && cd "$DIR"
URL=$(curl -fsSL https://api.github.com/repos/jitsi/docker-jitsi-meet/releases/latest | grep -o '"zipball_url": *"[^"]*"' | cut -d'"' -f4)
curl -fsSL "$URL" -o release.zip
rm -rf src && mkdir src && unzip -q release.zip -d src && rm release.zip
cp -rn src/*/. . && rm -rf src

log "5/7 الإعداد (.env)"
[[ -f .env ]] || cp env.example .env
./gen-passwords.sh
SECRET_FILE="$DIR/.jwt_secret"
[[ -f "$SECRET_FILE" ]] || openssl rand -hex 32 > "$SECRET_FILE"
chmod 600 "$SECRET_FILE"
SECRET=$(cat "$SECRET_FILE")
PUBLIC_IP=$(curl -fsSL https://api.ipify.org || hostname -I | awk '{print $1}')

set_env() { # set_env KEY VALUE
  if grep -qE "^#?\s*$1=" .env; then sed -i -E "s|^#?\s*$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}
set_env CONFIG "$CFG"
set_env TZ "$TZ_NAME"
set_env HTTP_PORT 80
set_env HTTPS_PORT 443
set_env PUBLIC_URL "https://$DOMAIN"
set_env JVB_ADVERTISE_IPS "$PUBLIC_IP"
set_env ENABLE_LETSENCRYPT 1
set_env LETSENCRYPT_DOMAIN "$DOMAIN"
set_env LETSENCRYPT_EMAIL "$EMAIL"
set_env ENABLE_HTTP_REDIRECT 1
# حماية الغرف: لا يدخل أحد إلا بتوكن توقّعه المنصة
set_env ENABLE_AUTH 1
set_env ENABLE_GUESTS 0
set_env AUTH_TYPE jwt
set_env JWT_APP_ID "$APP_ID"
set_env JWT_APP_SECRET "$SECRET"
set_env JWT_ACCEPTED_ISSUERS "$APP_ID"
set_env JWT_ACCEPTED_AUDIENCES "$APP_ID"
# الطالب لا يصبح مشرفاً تلقائياً — المشرف من التوكن فقط (المعلمة)
set_env ENABLE_AUTO_OWNER 0
set_env XMPP_MUC_MODULES token_affiliation
# تجربة الاستخدام
set_env ENABLE_PREJOIN_PAGE 0
set_env ENABLE_WELCOME_PAGE 0
set_env ENABLE_CLOSE_PAGE 0
set_env DISABLE_DEEP_LINKING true
set_env ENABLE_LOBBY 0
set_env ENABLE_BREAKOUT_ROOMS 1
set_env ENABLE_RECORDING 0
set_env DEFAULT_LANGUAGE ar
set_env RESTART_POLICY unless-stopped

log "6/7 مجلدات الإعداد (الحاويات تعمل بدون صلاحيات root)"
mkdir -p "$CFG"/{web,prosody/config,prosody/prosody-plugins-custom,jicofo,jvb,jigasi,jibri,transcriber}
mkdir -p "$CFG"/storage/{jibri,prosody,transcripts,web} "$CFG"/tmp/{web-crontabs,web-load-test}
chmod 777 "$CFG"/storage/{jibri,prosody,transcripts,web} "$CFG"/tmp/{web-crontabs,web-load-test}
# السماح بتضمين الغرفة داخل المنصة فقط (iframe)
cat > "$CFG/web/custom-config.js" <<'JS'
config.disableDeepLinking = true;
config.prejoinConfig = { enabled: false };
config.disableInviteFunctions = true;
config.enableWelcomePage = false;
config.p2p = { enabled: true };
config.resolution = 720;
config.constraints = { video: { height: { ideal: 720, max: 720, min: 180 } } };
JS

log "7/7 التشغيل"
docker compose pull
docker compose up -d
sleep 20
docker compose ps

cat <<EOF

=====================================================================
 ✅ تم تركيب سيرفر البث: https://$DOMAIN
    (أول مرة قد يستغرق إصدار شهادة SSL دقيقة إلى دقيقتين)

 خطوتك التالية في مشروع Cloudflare:
   1) npx wrangler pages secret put JITSI_APP_SECRET --project-name edaat-platform
      والقيمة:  $SECRET
   2) في wrangler.jsonc ⇐ vars:
        "JITSI_DOMAIN": "$DOMAIN",
        "JITSI_APP_ID": "$APP_ID"
   3) npm run deploy

 احتفظ بالسر في مكان آمن (موجود أيضاً في $SECRET_FILE)
 للتحديث لاحقاً:  cd $DIR && docker compose pull && docker compose up -d
=====================================================================
EOF
