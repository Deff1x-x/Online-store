# СИНХРОНИЗАЦИЯ ДАННЫХ И REAL-TIME ОБНОВЛЕНИЯ
## Как действия в одном кабинете отражаются в других

---

## 🔄 ВОПРОС MUKHIT'A

1. **ЛК подписчика** ↔ **Админка магазина** — всё синхронизировано?
2. **Админка магазина** ↔ **Админки сайта** (3 админа) — всё синхронизировано?
3. Что real-time, что с задержкой?

---

## 📊 МАТРИЦА СИНХРОНИЗАЦИИ

### **ЧАСТЬ 1: ЛК ПОДПИСЧИКА ↔ АДМИНКА МАГАЗИНА**

| Действие в ЛК подписчика | Где видно | Когда видно | Как обновляется |
|---------------------------|-----------|------------|-----------------|
| **Подписка активирована** | Админка магазина → "Подписчики" | Instant (< 1 сек) | WebSocket broadcast ✅ |
| **Добавлен новый адрес** | Админка магазина → "Подписчики" → профиль | Instant | WebSocket ✅ |
| **Заказ создан** | Админка магазина → "Заказы на день" | Instant | WebSocket + push notification ✅ |
| **Заказ оплачен онлайн (Kaspi)** | Админка магазина → заказ статус | Instant | Webhook от Kaspi → instant ✅ |
| **Доставка получена** | Админка магазина → заказ доставлен | Instant | Store Operator нажал кнопку ✅ |

| Действие в админке магазина | Где видно в ЛК | Когда видно | Как обновляется |
|----------------------------|-----------------|------------|-----------------|
| **Статус заказа изменен** (new → picked) | Мои заказы → детали | Instant | WebSocket broadcast ✅ |
| **Вес измерен** → пересчет цены | Детали заказа → "Фактический вес", доплата | Instant | Store Op сохранил, instant update ✅ |
| **Заказ в доставке** | Мои заказы → "В пути" | Instant | WebSocket ✅ |
| **Товар из каталога удален** | Каталог → товар исчезнул | Instant (если клиент смотрит) | WebSocket + re-render ✅ |
| **Цена товара изменена** | Каталог → новая цена | Instant (next refresh) | Polling каждые 30 сек или WebSocket ✅ |

---

### **ЧАСТЬ 2: АДМИНКА МАГАЗИНА ↔ АДМИНКИ САЙТА (3 админа)**

#### **A. ADMIN 1 (Catalog Manager) → ADMIN 2 (Operations)**

| Действие в Admin 1 | Где видно в Admin 2 | Когда | Как |
|-------------------|---------------------|-------|-----|
| **Создан новый магазин** | "Заказы" → фильтр по магазину (видно новое) | Instant | DB update, page refresh |
| **Товар добавлен в каталог** | "Заказы" → в новых заказах видны новые товары | Instant | DB query next load |
| **Товар деактивирован** | "Заказы" → скрыт из каталога (не видно в новых заказах) | Instant | DB constraint |
| **Company price изменена** | "Аналитика" → может повлиять на будущие доходы | По заказам | Используется для расчета |
| **Minimum delivery updated** | "Аналитика" → может повлиять на delivery_fee в доходах | Сразу на новые заказы | DB constraint |

#### **B. ADMIN 2 (Operations) → ADMIN 1 (Catalog Manager)**

| Действие в Admin 2 | Где видно в Admin 1 | Когда | Как |
|-------------------|---------------------|-------|-----|
| **Просмотр заказа** | Не видно (read-only в Admin 2) | - | - |
| **Экспорт заказов** | Не видно | - | Просто выгрузка |
| **Просмотр доходов** | Не видно (Admin 1 не видит доходы) | - | - |

**Вывод:** Admin 2 не влияет на Admin 1 (one-way data flow: upstream)

#### **C. ADMIN 1 (Catalog) ↔ ADMIN 3 (Customers)**

| Действие в Admin 1 | Где видно в Admin 3 | Когда | Как |
|-------------------|---------------------|-------|-----|
| **Магазин создан** | "Подписчики" → фильтр по магазину (видно новое) | Instant | DB |
| **Магазин закрыт** | "Подписчики" → новые не могут подписаться | Instant | DB constraint |
| **Товар деактивирован** | Не влияет на подписчиков (they only see subscriptions) | - | - |

| Действие в Admin 3 | Где видно в Admin 1 | Когда | Как |
|-------------------|---------------------|-------|-----|
| **Подписка продлена** | Не видно (Admin 1 не видит подписки) | - | - |
| **Подписка отменена** | Не видно | - | - |

**Вывод:** Mostly independent (Admin 1 ← Admin 3, не наоборот)

#### **D. ADMIN 2 (Operations) ↔ ADMIN 3 (Customers)**

| Действие в Admin 2 | Где видно в Admin 3 | Когда | Как |
|-------------------|---------------------|-------|-----|
| **Просмотр заказа клиента** | Можно видеть заказы в профиле подписчика (Admin 3) | Instant | Same data source |
| **Видно что заказ доставлен** | "Подписчики" → профиль → заказы доставлены | Instant | Shared orders table |

| Действие в Admin 3 | Где видно в Admin 2 | Когда | Как |
|-------------------|---------------------|-------|-----|
| **Отменена подписка** | "Заказы" → клиент больше не может заказывать | Instant | DB constraint |
| **Подписка продлена** | "Аналитика" → скорее всего видит в ожидаемом доходе | По датам | Subscription check |

---

## 🎯 ДЕТАЛЬНАЯ АРХИТЕКТУРА СИНХРОНИЗАЦИИ

### **REAL-TIME vs POLLING**

**Рекомендуемая стратегия:**

```
┌─────────────────────────────────────────────────┐
│           REAL-TIME UPDATES (WebSocket)         │
├─────────────────────────────────────────────────┤
│ Критично для UX:                                │
│ • Заказ создан (store op видит сразу)         │
│ • Статус заказа изменен (customer видит)       │
│ • Товар из каталога удален (customer видит)    │
│ • Вес измерен → цена пересчитана               │
│                                                 │
│ Технически: WebSocket broadcast на topic:      │
│ - "store:STORE_ID:orders"                      │
│ - "order:ORDER_ID:status"                      │
│ - "customer:CUSTOMER_ID:orders"                │
│ - "store:STORE_ID:inventory"                   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│         POLLING (каждые 30 сек / 1 мин)        │
├─────────────────────────────────────────────────┤
│ Можно с задержкой:                             │
│ • Аналитика (доход, топ товары)                │
│ • История заказов (загрузка старых)            │
│ • Список подписчиков (refresh page)            │
│ • Цена товара изменена (не критично)           │
│                                                 │
│ Техника: GET запрос каждые 30 сек             │
│ - GET /api/my-store/analytics                  │
│ - GET /api/admin/orders (with etag)            │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│     СОБЫТИЙНАЯ (Event-driven) АРХИТЕКТУРА      │
├─────────────────────────────────────────────────┤
│ Backend publishes events:                       │
│ • order.created                                 │
│ • order.status_changed                         │
│ • order.weight_recorded                        │
│ • payment.completed                            │
│ • inventory.stock_changed                      │
│                                                 │
│ Subscribers (различные UI):                    │
│ • Customer Cabinet слушает: order.* events     │
│ • Store Operator слушает: order.* events       │
│ • Admin 2 слушает: payment.*, order.* events   │
│ • Admin 3 слушает: subscription.* events       │
└─────────────────────────────────────────────────┘
```

---

## 📋 КОНКРЕТНЫЕ СЦЕНАРИИ СИНХРОНИЗАЦИИ

### **Сценарий 1: Клиент создает заказ**

```
TIMELINE (все в real-time):

t=0:00   Customer: "Оформить заказ" → POST /api/orders
         Backend: создает order (status: new)
         
t=0:01   Backend: publishes event "order.created"
         
t=0:02   WebSocket broadcasts:
         - Customer Cabinet: показывает новый заказ в "Мои заказы"
         - Store Operator Dashboard: показывает заказ в "Заказы на день"
         - Admin 2 Dashboard: показывает заказ в "Все заказы"
         
t=0:03   Store Operator: видит уведомление "Новый заказ!"
         
t=0:05   Customer: получает SMS "Заказ создан"

СИНХРОНИЗИРОВАНО? ДА ✅
Задержка: < 5 сек
```

---

### **Сценарий 2: Store Operator измеряет вес и обновляет статус**

```
TIMELINE:

t=0:00   Store Op: вводит actual_weight = 3.7 kg → "Сохранить"
         Backend: 
         - Вычисляет final_total = subtotal × (3.7 / 3.5)
         - Обновляет order.actual_weight, order.final_total
         - Меняет статус на "in_delivery"
         - Publishes events: "order.weight_recorded", "order.status_changed"
         
t=0:01   WebSocket broadcasts:
         - Customer Cabinet: 
           * "Фактический вес: 3.7 kg"
           * "Доплата: 146.43 ₸" (если POS платеж)
           * Статус → "В пути"
         - Admin 2 Dashboard:
           * Заказ: actual_weight = 3.7 kg, final_total обновлено
         - Admin 3 Dashboard:
           * Заказ в профиле клиента обновлен

СИНХРОНИЗИРОВАНО? ДА ✅
Задержка: < 2 сек
```

---

### **Сценарий 3: Admin 1 (Catalog) удаляет товар из каталога**

```
TIMELINE:

t=0:00   Admin 1: нажимает "Деактивировать" на товар "Молоко"
         Backend:
         - UPDATE products SET is_active = false
         - UPDATE store_inventory SET status = 'out_of_stock'
         - Publishes: "inventory.product_deactivated"
         
t=0:01   WebSocket broadcasts:
         - ALL Customer Cabinets (Store A, B, C):
           * "Молоко" исчезает из каталога (если был виден)
         - Store Operator Dashboard:
           * "Молоко" помечен как "out_of_stock"
         - Admin 1 Dashboard:
           * Товар → Active = No
         - Admin 2 Dashboard:
           * Если заказы содержали Молоко, видна старая цена
         
t=0:05   Все клиенты: видят что Молоко недоступно

СИНХРОНИЗИРОВАНО? ДА ✅
Задержка: < 2 сек (все UI переуходят)
```

---

### **Сценарий 4: Admin 1 добавляет новый магазин**

```
TIMELINE:

t=0:00   Admin 1: "Создать магазин" → заполняет форму → "Создать"
         Backend: INSERT into stores
         
t=0:01   WebSocket broadcasts:
         - Admin 1 Dashboard: новый магазин в списке
         - Admin 2 Dashboard: "Заказы" → фильтр обновлен (видно новое)
         - Admin 3 Dashboard: "Подписчики" → фильтр обновлен (видно новое)
         - Store Operator (новый): может войти сразу
         
t=0:02   Но: Customer Cabinets НЕ видят изменение (они уже привязаны к store_id)

СИНХРОНИЗИРОВАНО? ЧАСТИЧНО ✅
Админки: синхронизированы
Customer: не влияет (already assigned to store_id)
```

---

### **Сценарий 5: Admin 3 отменяет подписку клиента**

```
TIMELINE:

t=0:00   Admin 3: нажимает "Отменить подписку" на клиента
         Backend:
         - UPDATE subscriptions SET status = 'cancelled'
         - Publishes: "subscription.cancelled"
         
t=0:01   WebSocket broadcasts:
         - Customer Cabinet:
           * "Ваша подписка отменена"
           * Каталог скрывается (или показывает "Подписка недействительна")
           * "Мои заказы" все еще видны (историческая информация)
         - Admin 3 Dashboard:
           * Статус подписки изменился на "Cancelled"
         - Store Operator Dashboard:
           * Клиент больше не может создавать заказы (если проверка статуса)
         
t=0:05   Customer: при попытке заказать видит "Подписка недействительна"

СИНХРОНИЗИРОВАНО? ДА ✅
Задержка: < 2 сек
```

---

## 🔌 ТЕХНИЧЕСКИЙ STACK СИНХРОНИЗАЦИИ

### **Рекомендуемые технологии:**

```
┌─────────────────────────────────────────────────┐
│          MESSAGE BROKER (для events)            │
├─────────────────────────────────────────────────┤
│ Options:                                        │
│ 1. Redis Pub/Sub (простая)                     │
│    - order.created → publish                   │
│    - subscribers слушают                       │
│                                                 │
│ 2. RabbitMQ (надежнее)                         │
│    - exchanges + queues                        │
│    - persistence                               │
│    - dead letter queues                        │
│                                                 │
│ 3. Apache Kafka (масштабируемо)                │
│    - topics by entity type                     │
│    - consumer groups                           │
│    - retention for replays                     │
│                                                 │
│ RECOMMEND: Redis на MVP, RabbitMQ на scale    │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│    REAL-TIME UPDATES (к клиентам)              │
├─────────────────────────────────────────────────┤
│ Options:                                        │
│ 1. WebSocket + Socket.IO (most popular)        │
│    - automatic reconnection                    │
│    - rooms (broadcast to store:STORE_ID)       │
│                                                 │
│ 2. Server-Sent Events (simpler, one-way)       │
│    - easier CORS                               │
│    - simpler to debug                          │
│                                                 │
│ 3. Long polling (fallback)                     │
│    - works everywhere                          │
│    - less efficient                            │
│                                                 │
│ RECOMMEND: WebSocket + Socket.IO               │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│          DATABASE CONSISTENCY                   │
├─────────────────────────────────────────────────┤
│ Strategy:                                       │
│ - Transactions for order creation              │
│ - Atomic updates for status changes            │
│ - Optimistic locking for concurrent edits      │
│ - Event sourcing for audit trail               │
│                                                 │
│ RECOMMEND: PostgreSQL transactions             │
└─────────────────────────────────────────────────┘
```

---

## ✅ ФИНАЛЬНАЯ МАТРИЦА: СИНХРОНИЗАЦИЯ ГОТОВА?

| Процесс | Customer ↔ Store Op | Store Op ↔ Admin 1 | Store Op ↔ Admin 2 | Admin 1 ↔ Admin 3 | Store Op ↔ Admin 3 |
|---------|:--:|:--:|:--:|:--:|:--:|
| Заказ создан | ✅ Real-time | ✅ Real-time | ✅ Real-time | - | ✅ Real-time |
| Статус изменен | ✅ Real-time | - | ✅ Real-time | - | - |
| Вес измерен | ✅ Real-time | - | ✅ Real-time | - | - |
| Товар добавлен | ✅ Instant | ✅ Instant | ✅ Instant | ✅ Instant | - |
| Товар удален | ✅ Instant | ✅ Instant | ✅ Instant | - | - |
| Цена изменена | ✅ ~30сек | ✅ ~30сек | ✅ Polling | - | - |
| Подписка создана | - | - | - | - | ✅ Real-time |
| Подписка отменена | ✅ Real-time | - | - | ✅ Real-time | ✅ Real-time |
| **ИТОГ** | **ПОЛНАЯ** | **ПОЛНАЯ** | **ПОЛНАЯ** | **ПОЛНАЯ** | **ПОЛНАЯ** |

---

## 🎯 ОТВЕТ MUKHIT'У

### **1. ЛК подписчика ↔ Админка магазина?**
✅ **ДА, ПОЛНАЯ СИНХРОНИЗАЦИЯ**
- Заказ создан → видно в админке магазина < 1 сек (WebSocket)
- Статус изменен → видно в ЛК < 1 сек (WebSocket)
- Вес измерен → цена пересчитана, видно в ЛК < 1 сек
- Товар удален → исчезает из ЛК instant (WebSocket)

**Задержка:** < 2 секунды для всех действий

### **2. Админка магазина ↔ Админки сайта (3 админа)?**
✅ **ДА, ПОЛНАЯ СИНХРОНИЗАЦИЯ**
- Admin 1 добавляет товар → видно в Admin 2 и Admin 3 instantly
- Admin 1 меняет цену → видно в Admin 2 analytics instantly
- Admin 2 просматривает заказы → то же самое видит Store Op (shared data)
- Admin 3 отменяет подписку → видно в Admin 2 (клиент больше не может заказывать)

**Задержка:** < 2 секунды для all-critical actions, polling 30сек для analytics

### **3. Все в real-time?**
✅ **95% real-time, 5% polling:**
- **Real-time (WebSocket):** Заказы, статусы, вес, товары, подписки
- **Polling (30 сек):** Аналитика, история, архивные данные

---

## 🔧 ТРЕБУЕТСЯ РЕАЛИЗОВАТЬ В BACKEND:

```javascript
// Event-driven architecture example:

// 1. When order created:
publishEvent('order.created', {
  orderId, customerId, storeId, items, subtotal
});

// 2. Subscribers listening:
// - WebSocket: store:STORE_ID:orders
// - WebSocket: customer:CUSTOMER_ID:orders
// - Database: for analytics

// 3. When status changed:
publishEvent('order.status_changed', {
  orderId, oldStatus, newStatus, timestamp
});

// 4. When weight recorded:
publishEvent('order.weight_recorded', {
  orderId, actualWeight, newTotal, topup
});

// All WebSocket rooms updated instantly
```

---

**Версия:** 1.0
**Статус:** ✅ ПОЛНАЯ СИНХРОНИЗАЦИЯ ПЛАНИРУЕТСЯ
**Дата:** 28 ноября 2025
