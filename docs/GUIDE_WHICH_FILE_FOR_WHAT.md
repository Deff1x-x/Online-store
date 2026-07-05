# ДОКУМЕНТ ИСПОЛЬЗОВАНИЯ — КАКОЙ ФАЙЛ ДЛЯ ЧЕГО

---

## 📋 ПЯТЬ ДОКУМЕНТОВ: НАЗНАЧЕНИЕ И ИСПОЛЬЗОВАНИЕ

Всего 5 документов. Ниже описано, когда какой открывать.

---

## 🎯 ПО РОЛЯМ

### **РАЗРАБОТЧИК BACKEND**

**Сценарий 1: Начало работы (день 1)**
1. Открой: **QUICK_START_DEVS.md**
2. Прочитай: строки 1–100 (overview, 3 админа, основные workflows)
3. Время: 15 минут
4. Цель: понять что ты будешь строить

**Сценарий 2: Проектирование БД**
1. Открой: **ARCHITECTURE_AND_IMPLEMENTATION.md**
2. Перейди к: "DATABASE SCHEMA" (строки 55–180)
3. Скопируй: весь SQL код в свой migration tool
4. Время: 30 минут
5. Цель: создать таблицы в PostgreSQL

**Сценарий 3: Написание endpoints**
1. Открой: **ARCHITECTURE_AND_IMPLEMENTATION.md**
2. Перейди к: "API ENDPOINTS" (строки 185–350)
3. Для каждого endpoint:
   - Input / Output (копируй структуру)
   - Authorization (кто может вызвать)
   - Logic (что делать с данными)
4. Время: 1–2 часа (в зависимости от количества endpoints)
5. Цель: написать все API routes

**Сценарий 4: Реализация сложной логики (скидки, вес, доставка)**
1. Открой: **PROMPT_FOR_CURSOR_CODEX.md**
2. Перейди к: "KEY WORKFLOWS" (строки 80–160)
3. Выбери workflow:
   - WORKFLOW 1: Заказ со скидками (первый заказ + промокод + доставка)
   - WORKFLOW 2: Валидация промокода
   - WORKFLOW 3: Вес и пересчет цены
   - WORKFLOW 4: Создание промокода
4. Используй: "Code Pattern" как шаблон для своего кода
5. Время: 30 мин–1 час на workflow
6. Цель: реализовать бизнес-логику правильно

**Сценарий 5: Понимание авторизации (кто что может)**
1. Открой: **TECHNICAL_SPEC_ENTITIES_WORKFLOWS.md**
2. Перейди к: "AUTHORIZATION MATRIX" (конец документа)
3. Найди свой endpoint в таблице
4. Проверь: какие роли имеют доступ
5. Добавь: middleware check в свой код
6. Время: 10 минут
7. Цель: реализовать RBAC middleware правильно

**Сценарий 6: Понимание entities и relationships**
1. Открой: **TECHNICAL_SPEC_ENTITIES_WORKFLOWS.md**
2. Перейди к: "CORE ENTITIES" (строки 1–150)
3. Для каждого entity:
   - Прочитай: определение (fields, constraints)
   - Посмотри: relationships
4. Время: 45 минут (медленное чтение)
5. Цель: знать какие данные хранить и как связывать

---

### **РАЗРАБОТЧИК FRONTEND**

**Сценарий 1: Понимание flows (что рисовать)**
1. Открой: **TECHNICAL_SPEC_ENTITIES_WORKFLOWS.md**
2. Перейди к: "DETAILED WORKFLOWS" (строки 260–550)
3. Прочитай workflow своей роли:
   - Customer workflow (страницы registration → order → payment)
   - Store Operator workflow (страницы inventory → orders → delivery)
   - Admin workflow (какие экраны нужны)
4. Для каждого step: нарисуй форму или экран
5. Время: 1–2 часа
6. Цель: знать какие компоненты нужны

**Сценарий 2: Понимание API (input/output)**
1. Открой: **ARCHITECTURE_AND_IMPLEMENTATION.md**
2. Перейди к: "API ENDPOINTS" (строки 185–350)
3. Для каждого компонента:
   - Найди endpoint который он вызывает
   - Посмотри: Input (что отправляешь)
   - Посмотри: Output (что получаешь)
   - Посмотри: Error cases (что может пойти не так)
4. Напиши: axios/fetch функцию на основе этого
5. Время: 2–3 часа
6. Цель: знать как вызывать backend

**Сценарий 3: Реализация логики (скидки на UI)**
1. Открой: **QUICK_START_DEVS.md**
2. Перейди к: "Workflow 2: Customer Orders" (строки 85–130)
3. Прочитай: как работают скидки, доставка, вес
4. Реализуй на UI:
   - Поле для промокода
   - Real-time валидация (POST /api/orders/:id/validate-promo)
   - Показ breakdown (subtotal - discount + delivery_fee = final_total)
5. Время: 1–2 часа
6. Цель: правильный UX для скидок

**Сценарий 4: Дизайн 3 админ-панелей**
1. Открой: **QUICK_START_DEVS.md**
2. Перейди к: "THE THREE ADMIN ROLES" (строки 35–60)
3. Для каждой админки:
   - Admin 1 (Catalog Manager): какие компоненты нужны?
   - Admin 2 (Operations Monitor): таблицы, графики, фильтры
   - Admin 3 (Customers Monitor): списки, статусы, действия
4. Нарисуй: мокапы для каждой
5. Время: 2–3 часа
6. Цель: знать что строить для админок

---

### **QA / ТЕСТИРОВЩИК**

**Сценарий 1: Написание test cases**
1. Открой: **TECHNICAL_SPEC_ENTITIES_WORKFLOWS.md**
2. Перейди к: "DETAILED WORKFLOWS" (строки 260–550)
3. Для каждого workflow:
   - Прочитай step-by-step
   - Напиши test case для каждого step
   - Пример:
     ```
     Test: Customer applies promo code
     1. Precondition: order exists, promo code "SUMMER20" is active
     2. Action: POST /api/orders/:id/validate-promo {code: "SUMMER20"}
     3. Expected: {is_valid: true, discount_amount: 1000}
     4. Verify: order.final_total updated correctly
     ```
4. Время: 2–3 часа (на все workflows)
5. Цель: полное покрытие всех scenarios

**Сценарий 2: Тестирование авторизации**
1. Открой: **TECHNICAL_SPEC_ENTITIES_WORKFLOWS.md**
2. Перейди к: "AUTHORIZATION MATRIX" (конец документа)
3. Для каждого endpoint:
   - Проверь: можно ли вызвать если не авторизован? (ожидаемо: 401)
   - Проверь: можно ли вызвать с неправильной ролью? (ожидаемо: 403)
   - Проверь: можно ли вызвать с правильной ролью? (ожидаемо: 200)
4. Время: 1–2 часа
5. Цель: убедиться что RBAC работает правильно

**Сценарий 3: Тестирование скидок и веса**
1. Открой: **PROMPT_FOR_CURSOR_CODEX.md**
2. Перейди к: "KEY WORKFLOWS" (строки 80–160)
3. Напиши test cases для:
   - WORKFLOW 1: Order with discounts
   - WORKFLOW 3: Weight-based adjustment
4. Test cases:
   ```
   Test: First order discount applied
   1. Customer has no previous orders
   2. Create order
   3. Verify: first_order_discount applied
   4. Verify: is_used = true
   5. Try create another order
   6. Verify: first_order_discount NOT applied (already used)
   
   Test: Weight adjustment
   1. Create order with estimated_weight = 15kg
   2. Record actual_weight = 16.2kg
   3. Verify: final_total recalculated
   4. Verify: pos_terminal_topup = (16.2/15) * subtotal - online_paid
   ```
5. Время: 1–2 часа
6. Цель: убедиться что логика правильная

**Сценарий 4: Тестирование промокодов**
1. Открой: **PROMPT_FOR_CURSOR_CODEX.md**
2. Перейди к: "WORKFLOW 2: Validate Promo Code" (строки 100–130)
3. Напиши test cases для всех условий:
   - Valid code
   - Expired code
   - Max uses exceeded
   - Minimum order not met
   - Customer already used N times
   - Invalid code format
4. Время: 1 час
5. Цель: покрыть все branches валидации

---

### **PROJECT MANAGER / PRODUCT OWNER**

**Сценарий 1: Быстрый обзор (что мы строим)**
1. Открой: **QUICK_START_DEVS.md**
2. Прочитай: только строки 1–60
3. Время: 10 минут
4. Цель: понять архитектуру

**Сценарий 2: План разработки (когда что готово)**
1. Открой: **ARCHITECTURE_AND_IMPLEMENTATION.md**
2. Перейди к: "DEVELOPMENT PHASES" (строки 355–450)
3. Посмотри:
   - Phase 1: Foundation (какие features)
   - Phase 2: Core Data (какие features)
   - Phase 3: Orders (какие features)
   - ...и т.д.
4. Для каждой фазы: estimate, dependencies
5. Время: 30 минут
6. Цель: знать когда что доставляется

**Сценарий 3: Риски и сложные моменты**
1. Открой: **QUICK_START_DEVS.md**
2. Перейди к: "HARDEST PARTS" (строки 210–240)
3. Прочитай: почему это сложно, сколько времени, что может сломаться
4. Время: 15 минут
5. Цель: знать где ставить буферы времени

**Сценарий 4: API spec для integration testing**
1. Открой: **ARCHITECTURE_AND_IMPLEMENTATION.md**
2. Перейди к: "API ENDPOINTS" (строки 185–350)
3. Используй: для написания smoke tests или postman collection
4. Время: 1 час
5. Цель: знать что тестировать перед release

---

### **DEVOPS / SYSTEM ADMIN**

**Сценарий 1: Развертывание (что нужно)**
1. Открой: **ARCHITECTURE_AND_IMPLEMENTATION.md**
2. Перейди к: "DEPLOYMENT CHECKLIST" (строки 470–490)
3. Чеклист:
   - Database setup
   - Secrets management
   - SSL/HTTPS
   - Monitoring
   - Backups
4. Время: 30 минут
5. Цель: знать что настроить перед go-live

**Сценарий 2: Безопасность (что защищать)**
1. Открой: **ARCHITECTURE_AND_IMPLEMENTATION.md**
2. Перейди к: "SECURITY CHECKLIST" (строки 495–510)
3. Пункты:
   - Input validation
   - Password hashing
   - JWT security
   - Rate limiting
   - Logging (no sensitive data)
4. Время: 30 минут
5. Цель: знать какие security checks реализовать

---

## 📑 ПО ЗАДАЧАМ

### **"Мне нужно понять как работает система"**
→ **QUICK_START_DEVS.md** (15 минут)

### **"Я пишу новый endpoint"**
→ **ARCHITECTURE_AND_IMPLEMENTATION.md** + **TECHNICAL_SPEC_ENTITIES_WORKFLOWS.md**
(смотри inputs/outputs + workflow)

### **"Я пишу функцию скидок / веса / доставки"**
→ **PROMPT_FOR_CURSOR_CODEX.md** (KEY WORKFLOWS section)

### **"Я делаю UI для заказа"**
→ **TECHNICAL_SPEC_ENTITIES_WORKFLOWS.md** (CUSTOMER WORKFLOW)

### **"Мне нужна авторизация для endpoint X"**
→ **TECHNICAL_SPEC_ENTITIES_WORKFLOWS.md** (AUTHORIZATION MATRIX конец документа)

### **"Я тестирую скидки"**
→ **PROMPT_FOR_CURSOR_CODEX.md** (WORKFLOW 1, 2, 4)

### **"Я тестирую вес и цену"**
→ **PROMPT_FOR_CURSOR_CODEX.md** (WORKFLOW 3)

### **"Мне нужна SQL schema"**
→ **ARCHITECTURE_AND_IMPLEMENTATION.md** (DATABASE SCHEMA, copy-paste готов)

### **"Мне нужен весь список API"**
→ **ARCHITECTURE_AND_IMPLEMENTATION.md** (API ENDPOINTS, все 50+)

### **"Мне нужно сгенерировать код через Cursor"**
→ **PROMPT_FOR_CURSOR_CODEX.md** (скопируй весь документ, вставь в Cursor)

### **"Я создаю промокод или доставку"**
→ **QUICK_START_DEVS.md** + **ARCHITECTURE_AND_IMPLEMENTATION.md**
(строки про pricing features)

---

## 🔍 БЫСТРАЯ НАВИГАЦИЯ ПО ФАЙЛАМ

### **00_INDEX_AND_NAVIGATION.md**
- Что: Навигация по всем документам
- Когда: Когда потерялся и не знаешь где искать
- Время: 10 минут
- Содержит:
  - Краткое описание каждого файла
  - Ссылки на конкретные строки
  - "Quick reference: Find things fast"

**Использовать если:** "Где мне найти X?"

---

### **QUICK_START_DEVS.md**
- Что: 1-страничный обзор всей системы
- Когда: День 1, kickoff meeting, новый разработчик присоединился
- Время: 15 минут (полностью), 5 минут (только overview)
- Содержит:
  - System overview
  - 3 админ-роли (что они делают)
  - Core workflows (subscribe → order → admin monitoring)
  - Architecture diagram
  - Database essentials (10 таблиц)
  - Tech stack
  - Hardest parts (что может взорваться)
  - MVP scope

**Использовать если:**
- Новый на проекте
- Нужно объяснить что мы строим
- Нужно быстро убедиться что ты понимаешь архитектуру

---

### **TECHNICAL_SPEC_ENTITIES_WORKFLOWS.md**
- Что: Детальная спецификация (entities, integrations, workflows)
- Когда: Разработка, тестирование, дизайн
- Время: 45 минут (медленное чтение)
- Содержит:
  - 10 entities (полное определение с constraints)
  - 6 integrations (payment, SMS, POS, etc.)
  - 6 detiled workflows (customer, store op, 3 admins)
  - Authorization matrix (5 ролей × endpoints)

**Использовать если:**
- Нужно знать структуру данных
- Нужно писать workflow
- Нужно проверить права доступа
- Нужно писать test cases

---

### **ARCHITECTURE_AND_IMPLEMENTATION.md**
- Что: Техническая архитектура, SQL schema, API endpoints, phase plan
- Когда: Разработка backend, database design, deployment
- Время: 30 минут (важные parts), 1 час (полностью)
- Содержит:
  - System architecture diagram
  - Full PostgreSQL schema (13 таблиц, copy-paste)
  - All 50+ API endpoints (с inputs/outputs)
  - 6 development phases (с чеклистами)
  - Deployment checklist
  - Security checklist

**Использовать если:**
- Проектируешь БД
- Пишешь endpoints
- Планируешь фазы разработки
- Готовишься к deploy
- Нужна security checklist

---

### **PROMPT_FOR_CURSOR_CODEX.md** ⭐
- Что: Prompts для AI code generators (Cursor, Codex, ChatGPT)
- Когда: Когда используешь AI для генерации кода
- Время: 30 минут (прочитать), 1 час (использовать)
- Содержит:
  - Project brief для AI
  - 4 key workflows с code patterns
  - Database schema (SQL)
  - Authorization rules
  - API endpoints по приоритету
  - Implementation checklist
  - Clarification points (что уточнить)

**Использовать если:**
- Используешь Cursor для генерации
- Используешь ChatGPT для написания функций
- Нужны code patterns для сложной логики
- Нужно понять code structure

**Как использовать:**
1. Скопируй весь документ
2. Вставь в Cursor / ChatGPT
3. Напиши: "Implement Phase 1: Foundation"
4. AI будет генерировать код на основе контекста

---

## 📊 МАТРИЦА: КТО ЧТО ЧИТАЕТ

| Роль | 1-й день | Разработка | Тестирование | Предpодакшн |
|------|----------|-----------|--------------|------------|
| Backend Dev | QUICK_START (15m) | ARCHITECTURE (schema+API) | TECHNICAL_SPEC (workflows) | PROMPT_FOR_CURSOR (logic) |
| Frontend Dev | QUICK_START (15m) | TECHNICAL_SPEC (workflows) | QUICK_START (pricing) | ARCHITECTURE (API) |
| QA / Tester | QUICK_START (5m) | TECHNICAL_SPEC (workflows) | PROMPT_FOR_CURSOR (tests) | ARCHITECTURE (checklist) |
| PM | QUICK_START (10m) | ARCHITECTURE (phases) | QUICK_START (risks) | ARCHITECTURE (deploy) |
| DevOps | QUICK_START (5m) | ARCHITECTURE (design) | ARCHITECTURE (security) | ARCHITECTURE (checklist) |

---

## ✅ ЧЕКЛИСТ: ЧТО ПРОЧИТАТЬ ПЕРЕД КОДИНГОМ

**Backend Developer:**
- [ ] QUICK_START_DEVS.md (overview)
- [ ] ARCHITECTURE_AND_IMPLEMENTATION.md (database schema)
- [ ] ARCHITECTURE_AND_IMPLEMENTATION.md (API endpoints)
- [ ] PROMPT_FOR_CURSOR_CODEX.md (workflows & patterns)
- [ ] TECHNICAL_SPEC_ENTITIES_WORKFLOWS.md (authorization matrix)
- **Время:** 2–3 часа

**Frontend Developer:**
- [ ] QUICK_START_DEVS.md (overview)
- [ ] TECHNICAL_SPEC_ENTITIES_WORKFLOWS.md (workflows)
- [ ] ARCHITECTURE_AND_IMPLEMENTATION.md (API endpoints)
- [ ] QUICK_START_DEVS.md (pricing & discounts section)
- **Время:** 1–2 часа

**QA:**
- [ ] QUICK_START_DEVS.md (overview)
- [ ] TECHNICAL_SPEC_ENTITIES_WORKFLOWS.md (workflows)
- [ ] PROMPT_FOR_CURSOR_CODEX.md (key workflows for test cases)
- **Время:** 1–2 часа

**PM:**
- [ ] QUICK_START_DEVS.md (full)
- [ ] ARCHITECTURE_AND_IMPLEMENTATION.md (phases section only)
- **Время:** 30 минут

---

## 🚨 ПОМОЩЬ: БЫСТРЫЕ ОТВЕТЫ

**Q: "Где найти таблицу с правами доступа?"**
A: TECHNICAL_SPEC_ENTITIES_WORKFLOWS.md, конец документа, "AUTHORIZATION MATRIX"

**Q: "Какие API endpoints нужно реализовать?"**
A: ARCHITECTURE_AND_IMPLEMENTATION.md, секция "API ENDPOINTS", все 50+

**Q: "Как работает скидка на первый заказ?"**
A: QUICK_START_DEVS.md, строки 18–22 или PROMPT_FOR_CURSOR_CODEX.md, WORKFLOW 1

**Q: "Как тестировать промокоды?"**
A: PROMPT_FOR_CURSOR_CODEX.md, WORKFLOW 2 или TECHNICAL_SPEC_ENTITIES_WORKFLOWS.md, Admin Role 1 workflows

**Q: "Какие таблицы нужны в БД?"**
A: ARCHITECTURE_AND_IMPLEMENTATION.md, DATABASE SCHEMA, copy-paste готово

**Q: "Когда что должно быть готово?"**
A: ARCHITECTURE_AND_IMPLEMENTATION.md, DEVELOPMENT PHASES, 6 фаз с чеклистами

**Q: "Какие проблемы могут возникнуть?"**
A: QUICK_START_DEVS.md, HARDEST PARTS или PROMPT_FOR_CURSOR_CODEX.md, IMPLEMENTATION NOTES

**Q: "Как генерировать код через AI?"**
A: PROMPT_FOR_CURSOR_CODEX.md, скопируй весь файл в Cursor/ChatGPT

---

**Версия:** 1.0
**Дата:** 28 ноября 2025
**Для:** Все роли (backend, frontend, QA, PM, DevOps)
