# Digital Cards на RED OS 7.3.3

Сервер приложения: **10.11.131.69**, x86_64. PostgreSQL находится на этой же машине.
HTTPS и сертификаты настраивает администратор на прокси **10.11.131.70**.

| Внешний адрес | Адрес для проксирования |
| --- | --- |
| https://cards.citrt.ru | http://10.11.131.69:8081 |
| https://cardsadmin.citrt.ru | http://10.11.131.69:8082 |

Backend слушает только `127.0.0.1:3000`. Apache и его настройки не изменяются.
Для сайтов используется отдельная служба `digital-cards-web` со своим Nginx-конфигом.
Команды выполняются на 10.11.131.69. При ошибке остановитесь на текущем шаге.

## 1. Программы

Нужны Node.js 24 с npm, PostgreSQL 17, Nginx, Git и sudo.
Проверьте свободные порты: `sudo ss -ltnp | grep -E ':(3000|5432|8081|8082)\b'`.
Если 5432 уже занят PostgreSQL — используйте существующий экземпляр, не создавайте второй.

### Node.js уже установлен

Проверьте `node --version` (v24.x), `npm --version`, `command -v node`.
Служба должна использовать абсолютный путь к Node вне домашнего каталога.

### Node.js отсутствует

Установите вспомогательные пакеты из подключённых репозиториев RED OS:

```bash
sudo dnf install curl tar xz git
```

Официальную сборку Node.js 24 устанавливаем отдельно в `/opt/node24`.
Весь блок выполняется целиком. Если этот каталог уже существует, установка остановится.

```bash
(
  set -eu
  task_dir=$(mktemp -d)
  cd "$task_dir"
  curl -fSLO https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt
  archive=$(awk '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ {print $2}' SHASUMS256.txt)
  test -n "$archive"
  curl -fSLO "https://nodejs.org/dist/latest-v24.x/$archive"
  awk -v archive="$archive" '$2 == archive' SHASUMS256.txt | sha256sum -c -
  tar -xf "$archive"
  folder=${archive%.tar.xz}
  "$task_dir/$folder/bin/node" --version
  sudo test ! -e /opt/node24
  sudo cp -a "$task_dir/$folder" /opt/node24
  sudo chown -R root:root /opt/node24
)
export PATH="/opt/node24/bin:$PATH"
node --version
npm --version
```

Повторяйте `export PATH=...` при новом SSH-сеансе, если Node установлен этим способом.
При ошибке GLIBC/GLIBCXX передайте её администратору для подбора совместимых библиотек.
Не заменяйте системную glibc вручную. Для установки нужен доступ к nodejs.org,
а для зависимостей проекта — к registry.npmjs.org.

## 2. PostgreSQL

### Если PostgreSQL ещё не установлен

Команды ниже предназначены только для нового экземпляра без существующих данных:

```bash
sudo dnf install postgresql17-server postgresql17
sudo postgresql-17-setup initdb
sudo systemctl enable --now postgresql-17.service
```

Если пакет недоступен, администратору нужно подключить подходящий репозиторий RED OS.
Не устанавливайте вместо него пакет PostgreSQL другой основной версии.

### Если PostgreSQL уже установлен

Пропустите установку и `initdb`. Уточните имя службы и путь к `psql`:

```bash
systemctl list-unit-files 'postgresql*'
sudo -u postgres sh -lc 'command -v psql'
```

Далее показан `/usr/bin/psql`. Если команда вернула другой путь, замените его ниже.
Проверьте именно сервер и его порт:

```bash
sudo -u postgres /usr/bin/psql -X -d postgres -c 'SHOW server_version; SHOW port; SHOW listen_addresses; SHOW hba_file;'
```

Ожидаются PostgreSQL 17 и порт 5432 с доступом через `127.0.0.1`.
В этой инструкции имя базы — `digital_cards`. Если выделена другая база, замените имя
в командах и правиле ниже. Если база отсутствует, создайте её:

```bash
sudo -u postgres /usr/bin/psql -X -d postgres -c 'CREATE DATABASE digital_cards;'
```

Если база уже существует, пропустите создание. Для первой установки нужна пустая база.
Если в ней уже работает Digital Cards, сохраняйте существующие настройки и роли,
повторную инициализацию из раздела 4 не выполняйте.

В `pg_hba.conf` (путь показан командой выше) перед более общими правилами добавьте:

```text
host digital_cards cards_public,cards_auth,cards_editor 127.0.0.1/32 scram-sha-256
```

Сохраните остальные правила, включая локальное администрирование от `postgres`.
Примените изменение:

```bash
sudo -u postgres /usr/bin/psql -X -d postgres -c 'SELECT pg_reload_conf();'
```

Доступ к 5432 из сети для работы сайта не нужен.

## 3. Сборка и размещение

Из корня скачанного проекта, обычным пользователем:

```bash
(
  set -e
  for project in backend admin-web public-web; do
    (cd "$project" && npm ci && npm run build)
  done
)
```

Продолжайте только после успешной сборки всех трёх приложений.
При первом размещении, если служебного пользователя ещё нет:

```bash
sudo useradd --system --user-group --home-dir /var/lib/digital-cards --shell /sbin/nologin digital-cards
```

```bash
sudo install -d -m 755 /opt/digital-cards
sudo cp -a backend admin-web public-web deploy /opt/digital-cards/
sudo chown -R root:root /opt/digital-cards
sudo chmod -R a+rX /opt/digital-cards
sudo install -d -o digital-cards -g digital-cards -m 700 /var/lib/digital-cards/images
```

Используйте чистую копию из Git. Рабочие `.env` и локальные фотографии сюда не копируются.

## 4. Настройки приложения

Для первой установки в пустую базу (замените путь Node, если используете другую установку):

```bash
sudo env PSQL_BIN=/usr/bin/psql /opt/node24/bin/node /opt/digital-cards/deploy/init-database.cjs https://cardsadmin.citrt.ru https://cards.citrt.ru digital_cards
```

Скрипт создаст роли, таблицы и `/etc/digital-cards/backend.env` с паролями (доступ только root).
При ошибке файл настроек сохраняется: не удаляйте его и не повторяйте инициализацию вслепую.

Для уже подготовленной установки используйте существующий `backend.env` и пароли.
Проверьте в нём следующие значения:

```dotenv
NODE_ENV=production
INTERNAL_HTTP=false
ADMIN_ORIGIN=https://cardsadmin.citrt.ru
PUBLIC_CARD_ORIGIN=https://cards.citrt.ru
HOST=127.0.0.1
PORT=3000
TRUST_LOCAL_PROXY=true
UPLOAD_DIRECTORY=/var/lib/digital-cards/images
```

Адреса баз `DATABASE_URL`, `AUTH_DATABASE_URL`, `EDITOR_DATABASE_URL` должны вести
на локальную базу и использовать соответствующие роли. Секреты не добавляйте в Git.
Несмотря на HTTP между серверами, `INTERNAL_HTTP` остаётся `false`: браузер работает по HTTPS.

## 5. Запуск служб

Из корня проекта подготовьте службу backend для RED OS.
В примере Node находится в `/opt/node24`, служба БД — `postgresql-17.service`.
Если реальные пути/имя службы отличаются, поправьте подстановки перед выполнением.

```bash
sed -e 's|/usr/bin/node|/opt/node24/bin/node|' -e 's|postgresql.service|postgresql-17.service|g' deploy/digital-cards.service > /tmp/digital-cards-redos.service
sudo install -m 644 /tmp/digital-cards-redos.service /etc/systemd/system/digital-cards.service
sudo systemctl daemon-reload
sudo systemctl enable --now digital-cards
sudo systemctl status digital-cards --no-pager
```

Nginx уже установлен. Проверьте `command -v nginx` и `id nginx`.
Служба ниже ожидает `/usr/sbin/nginx` и пользователя `nginx`.

```bash
sudo install -d -m 755 /var/log/nginx
sudo install -m 644 deploy/nginx-redos.conf /etc/digital-cards/nginx.conf
sudo /usr/sbin/nginx -t -c /etc/digital-cards/nginx.conf
```

Только после успешной проверки:

```bash
sudo install -m 644 deploy/digital-cards-web.service /etc/systemd/system/digital-cards-web.service
sudo systemctl daemon-reload
sudo systemctl enable --now digital-cards-web
sudo systemctl status digital-cards-web --no-pager
```

Не подключайте `nginx-redos.conf` к основному nginx.conf: это полный отдельный конфиг.
Не запускайте/перезапускайте общие службы `nginx` и `httpd` ради Digital Cards.
На предоставленной машине SELinux Disabled. Если режим изменится, администратор должен
настроить доступ Nginx к статике, портам и backend перед запуском.

## 6. Прокси и сеть

Передайте администратору 10.11.131.70 таблицу из начала инструкции и требования:

- DNS обоих имён ведёт на HTTPS-прокси, сертификат покрывает оба имени.
- Проксирование всех путей без добавления/удаления префиксов.
- Сохранение `Host` и `Origin`, перезапись `X-Real-IP` реальным IP клиента.
- `X-Forwarded-Proto: https`. Не принимать клиентский `X-Real-IP` без перезаписи.
- Для кабинета `client_max_body_size 6m`, тайм-аут ответа не менее 60 секунд.
- Не кэшировать `/api/`, не переписывать cookie и не добавлять CORS-заголовки.

Сетевой доступ: тестеры → **10.11.131.70:443**, прокси **10.11.131.70 → 10.11.131.69:8081,8082 TCP**.
8081/8082 разрешаются на firewall только от прокси. Правила существующего Apache и SSH сохраняются.
Порты 3000/5432 наружу не открываются. Сертификат на 10.11.131.69 не требуется.

## 7. Проверка

На сервере приложения:

```bash
curl --noproxy '*' -I http://10.11.131.69:8081/
curl --noproxy '*' -I http://10.11.131.69:8082/
sudo journalctl -u digital-cards -n 30 --no-pager
```

Оба запроса должны вернуть 200. На прокси проверьте те же адреса.
В браузере проверяйте HTTPS-имена: регистрация, вход, сохранение черновика,
загрузка фото, публикация, открытие визитки, QR и снятие с публикации.
Авторизация по внутреннему HTTP-адресу не проверяется: session cookie имеет флаг Secure.
До настройки DNS администратор может проверить HTTPS через `curl --resolve`, без отключения проверки сертификата.

После изменения env/backend: `sudo systemctl restart digital-cards`.
После изменения нашего Nginx: сначала `sudo nginx -t -c /etc/digital-cards/nginx.conf`,
затем `sudo systemctl reload digital-cards-web`.

Справка: [PostgreSQL в RED OS](https://redos.red-soft.ru/base/redos-7_3/7_3-administation/7_3-smdb-in-ro/7_3-install-postgresql/),
[требования Node.js 24](https://github.com/nodejs/node/blob/v24.x/BUILDING.md).
