# Запуск локально (проверено 06.07.2026, Ubuntu 24 / PostgreSQL 16 / Node 20+)

## 1. База
```bash
sudo apt install postgresql
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres createdb online_store
psql -h localhost -U postgres -d online_store -f database/schema.sql
for m in database/migrations/00*.sql; do psql -h localhost -U postgres -d online_store -f "$m"; done
```

## 2. Тестовые данные (Точка №1, дом, 4 товара, менеджер/админы)
См. блок INSERT в конце этого файла — либо database/seed.js (Kairosime-стартовый).
Пароль всех staff-аккаунтов: `Manager123`
- manager@koz.kz — store_operator (Точка №1)
- admin@koz.kz — admin_operations
- catalog@koz.kz — admin_catalog

## 3. Сервер
```bash
cp .env.example .env   # DATABASE_PASSWORD=postgres
npm install
node src/server.js     # порт 3000
```

## 4. Тестовая консоль
Открыть `test_console.html` в браузере (можно просто файлом — CORS открыт).
OTP-код клиента печатается в консоли сервера (dev-режим).

## 5. Что прогнать при приёмке (E2E, всё проверено против живой БД)
1. Гостевая витрина без токена → товары с ценами и остатками.
2. OTP-регистрация с согласиями ПДн → подписка 3 900 (повторная — 409).
3. Адрес (подъезд/этаж/кв/домофон) → заказ: весовой дробно (1,5 кг) + штучный.
   Проверить: доставка +500 при корзине <5000; холд = 80% итога; остаток списался.
4. Менеджер: pick → actual-weight (ввести МЕНЬШЕ расчётного — проверить partial
   capture: capture ≤ холда, ПОС-доплата = итог − capture) → in_delivery →
   delivered → payment_status=fully_paid, в payments появился pos_terminal completed.
5. Отмена нового заказа → остаток вернулся (cancelled из new/picked).
6. Админ: /admin/operations/stores/:id/report — GMV, онлайн/ПОС части.

## Тестовые данные (INSERT)
```sql
INSERT INTO stores (id,name,address,location,operating_hours,delivery_time_min,delivery_time_max)
VALUES ('11111111-1111-1111-1111-111111111111','Точка №1','Алматы, ЖК Asyl Arman','ЖК Asyl Arman','11:00-20:00',15,20);
INSERT INTO delivery_settings (store_id,min_order_value_for_free_delivery,delivery_fee,ordering_open_hour,ordering_close_hour)
VALUES ('11111111-1111-1111-1111-111111111111',5000,500,11,20);
INSERT INTO store_coverage (id,store_id,address,entrance_count)
VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','д. 4',4);
INSERT INTO products (id,name,category,unit,price_per_unit,company_price,is_weighted) VALUES
('33333333-3333-3333-3333-333333333331','Помидоры розовые','Vegetables','kg',426,380,true),
('33333333-3333-3333-3333-333333333332','Огурцы гладкие','Vegetables','kg',286,260,true),
('33333333-3333-3333-3333-333333333333','Молоко 3,2% 1 л','Dairy','pcs',462,420,false),
('33333333-3333-3333-3333-333333333334','Клубника','Fruits','kg',1711,1450,true);
INSERT INTO store_inventory (store_id,product_id,quantity,stock_quantity,selling_price,is_visible)
SELECT '11111111-1111-1111-1111-111111111111', id,
       CASE WHEN name LIKE 'Клубника%' THEN 15 WHEN name LIKE 'Молоко%' THEN 30 WHEN name LIKE 'Огурцы%' THEN 40 ELSE 50 END,
       CASE WHEN name LIKE 'Клубника%' THEN 15 WHEN name LIKE 'Молоко%' THEN 30 WHEN name LIKE 'Огурцы%' THEN 40 ELSE 50 END,
       price_per_unit, true
FROM products;
-- staff: хэш пароля сгенерировать node-скриптом (src/utils/auth.js -> hashPassword('Manager123'))
```

## Примечание про окно приёма заказов
`delivery_settings.ordering_open_hour/close_hour` (дефолт 11/20, Asia/Almaty).
Заказ вне окна автоматически получает fulfillment_window='next_morning'
и дату на завтра. Для круглосуточного тестирования поставьте 0/24.
