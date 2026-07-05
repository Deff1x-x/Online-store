# 📚 ТЕХНИЧЕСКАЯ ДОКУМЕНТАЦИЯ — ПОЛНЫЙ НАБОР

Все файлы для разработки платформы. Содержит полную спецификацию, архитектуру, API endpoints и промпты для AI кодеров.

---

## 📦 ШЕСТЬ ФАЙЛОВ

| # | Файл | Размер | Читай первым? | Для кого | Назначение |
|---|------|--------|:------:|----------|-----------|
| 1 | **README.md** | 2 KB | ✅ | Все | Этот файл (быстрая навигация) |
| 2 | **GUIDE_WHICH_FILE_FOR_WHAT.md** | 20 KB | ✅ | Все | Инструкция какой файл для какой задачи |
| 3 | **QUICK_START_DEVS.md** | 19 KB | ✅ | Разработчики, PM | 15-минутный обзор системы |
| 4 | **TECHNICAL_SPEC_ENTITIES_WORKFLOWS.md** | 22 KB | Backend/QA | Entities, workflows, авторизация |
| 5 | **ARCHITECTURE_AND_IMPLEMENTATION.md** | 19 KB | Backend, DevOps | SQL schema, API endpoints, phases |
| 6 | **PROMPT_FOR_CURSOR_CODEX.md** | 15 KB | AI code gen | Промпт для Cursor/ChatGPT |

---

## 🎯 БЫСТРЫЙ СТАРТ (ПО РОЛЯМ)

### **Я разработчик, начинаю сейчас**
1. Прочитай: **QUICK_START_DEVS.md** (15 минут)
2. Потом открой: **GUIDE_WHICH_FILE_FOR_WHAT.md** (найди свой сценарий)
3. Перейди в нужный документ

### **Я PM, мне нужен план**
1. Прочитай: **QUICK_START_DEVS.md** (10 минут, только overview)
2. Открой: **ARCHITECTURE_AND_IMPLEMENTATION.md** → "DEVELOPMENT PHASES"
3. Готово, знаешь план на 6 недель

### **Я тестировщик, нужны test cases**
1. Открой: **TECHNICAL_SPEC_ENTITIES_WORKFLOWS.md** → "DETAILED WORKFLOWS"
2. Написал test cases из workflows
3. Проверь: авторизация в "AUTHORIZATION MATRIX"

### **Я генерирую код через AI (Cursor/ChatGPT)**
1. Открой: **PROMPT_FOR_CURSOR_CODEX.md**
2. Скопируй весь текст
3. Вставь в Cursor / ChatGPT
4. Напиши: "Implement Phase 1"
5. AI будет генерировать код

### **Я DevOps, нужна infrastructure checklist**
1. Открой: **ARCHITECTURE_AND_IMPLEMENTATION.md**
2. Перейди к: "DEPLOYMENT CHECKLIST" + "SECURITY CHECKLIST"
3. Готово

---

## 📋 ЧТО В КАЖДОМ ФАЙЛЕ

### **1. README.md** (этот файл)
**Назначение:** Быстрая навигация, обзор всех файлов

**Читай если:** Не знаешь куда начать

**Содержит:**
- Таблица всех файлов
- Быстрый старт по ролям
- Что в каждом файле
- Матрица: кто что читает

---

### **2. GUIDE_WHICH_FILE_FOR_WHAT.md** ⭐ ГЛАВНЫЙ
**Назначение:** Практическая инструкция — какой файл открывать для какой задачи

**Читай если:** 
- "Я не знаю куда смотреть"
- "Как писать endpoint?"
- "Как тестировать скидки?"
- "Где SQL schema?"

**Содержит:**
- По ролям: Backend Dev, Frontend Dev, QA, PM, DevOps
- По задачам: "я пишу endpoint", "я делаю UI", "я тестирую"
- Быстрые ссылки на конкретные строки других файлов
- Чеклист что прочитать перед кодингом
- FAQ с быстрыми ответами

**Время чтения:** 15 минут (полностью)

---

### **3. QUICK_START_DEVS.md**
**Назначение:** 1-страничный обзор всей системы (архитектура, roles, workflows)

**Читай если:**
- День 1 (новый на проекте)
- Нужно быстро объяснить систему
- Kickoff meeting

**Содержит:**
- System overview (что это?)
- 3 админ-роли (Catalog Manager, Operations, Customers)
- Core workflows (subscribe → order → admin monitoring)
- Architecture diagram
- Database essentials (10 таблиц)
- Payment flow (online + POS + weight adjustment)
- Tech stack рекомендации
- Hardest parts (где может сломаться)
- Pricing features (скидка, промокод, доставка)

**Время чтения:** 15 минут

---

### **4. TECHNICAL_SPEC_ENTITIES_WORKFLOWS.md**
**Назначение:** Детальная спецификация — entities, workflows, авторизация

**Читай если:**
- Пишешь backend
- Проектируешь database
- Пишешь test cases
- Делаешь frontend (нужны workflows)

**Содержит:**
- 10 entities (определение, constraints, relationships)
- 6 integrations (Kaspi, SMS, email, POS, receipts, 1C)
- 6 detailed workflows:
  1. Customer registration & order (7 steps)
  2. Store operator daily operations (6 steps)
  3. Admin 1 (Catalog Manager) workflows
  4. Admin 2 (Operations) workflows
  5. Admin 3 (Customers) workflows
- Authorization matrix (5 ролей × endpoints)

**Время чтения:** 45 минут (медленное)

---

### **5. ARCHITECTURE_AND_IMPLEMENTATION.md**
**Назначение:** Техническая архитектура, SQL schema, API endpoints, development phases

**Читай если:**
- Проектируешь БД
- Пишешь API endpoints
- Планируешь разработку (phases)
- Готовишься к deploy

**Содержит:**
- System architecture diagram
- Full PostgreSQL schema (13 таблиц, 100% copy-paste готов)
- All 50+ API endpoints (inputs, outputs, auth, logic)
- 6 development phases с чеклистами
- Deployment checklist ( 12 пунктов)
- Security checklist (10 пунктов)

**Время чтения:** 30 минут (важные parts), 1 час (полностью)

---

### **6. PROMPT_FOR_CURSOR_CODEX.md** ⚡
**Назначение:** Промпт для AI code generators (Cursor, Codex, ChatGPT)

**Читай если:**
- Используешь Cursor for code generation
- Используешь ChatGPT для написания функций
- Нужны code patterns для сложной логики

**Содержит:**
- Project brief для AI (что это, features)
- 4 key workflows с code patterns:
  1. Customer order with discounts
  2. Validate promo code (real-time)
  3. Weight-based adjustment
  4. Create promo code (admin)
- Database schema (copy-paste)
- Authorization rules
- 50+ API endpoints (по приоритету)
- Implementation checklist (6 phases)
- Clarification points (что уточнить перед кодингом)

**Как использовать:**
1. Скопируй весь файл
2. Вставь в Cursor / ChatGPT
3. Напиши: "Implement Phase 1: Foundation"
4. AI генерирует код на основе контекста

**Время чтения:** 30 минут

---

## 📊 МАТРИЦА: ЧТО ЧИТАЕТ КТО

| Роль | Day 1 | Разработка | Тестирование | Deploy |
|------|-------|-----------|--------------|--------|
| **Backend Dev** | QUICK_START (15m) | ARCHITECTURE (schema) | TECHNICAL_SPEC (flows) | PROMPT (patterns) |
| **Frontend Dev** | QUICK_START (15m) | TECHNICAL_SPEC (flows) | GUIDE (test cases) | ARCHITECTURE (API) |
| **QA** | QUICK_START (5m) | TECHNICAL_SPEC (flows) | PROMPT (workflows) | ARCHITECTURE (checklist) |
| **PM** | QUICK_START (10m) | ARCHITECTURE (phases) | QUICK_START (risks) | ARCHITECTURE (deploy) |
| **DevOps** | QUICK_START (5m) | ARCHITECTURE (design) | GUIDE (security) | ARCHITECTURE (checklist) |

---

## ✅ TOTAL TIME TO BE READY

| Роль | Минимум | Рекомендуемо |
|------|---------|-------------|
| Backend Dev | 1 час | 2–3 часа |
| Frontend Dev | 1 час | 1.5–2 часа |
| QA | 30 минут | 1–1.5 часа |
| PM | 15 минут | 30 минут |
| DevOps | 15 минут | 30 минут |

---

## 🚀 NEXT STEPS

**Вариант A: Разработка вручную**
1. Прочитай: QUICK_START + GUIDE
2. Выбери свой сценарий в GUIDE
3. Открой нужный файл
4. Кодь

**Вариант B: AI code generation**
1. Прочитай: PROMPT_FOR_CURSOR_CODEX (30 мин)
2. Скопируй в Cursor / ChatGPT
3. Просит: "Implement Phase 1"
4. AI генерирует, ты проверяешь

**Вариант C: Гибрид (рекомендуется)**
1. Скелет кода → AI (PROMPT)
2. Бизнес-логика → ручно (TECHNICAL_SPEC + ARCHITECTURE)
3. Testing → ручно (GUIDE)

---

## 💡 СОВЕТ

**Первый день:** Все читают QUICK_START_DEVS.md + GUIDE_WHICH_FILE_FOR_WHAT.md

**Потом:** Каждый читает свои файлы по своему сценарию

**В сомнениях:** Открой GUIDE_WHICH_FILE_FOR_WHAT.md → найди свой вопрос → получи ссылку на нужный файл

---

## 📞 HELP

**"Где найти X?"**
→ Откройка GUIDE_WHICH_FILE_FOR_WHAT.md → раздел "БЫСТРАЯ НАВИГАЦИЯ"

**"Как писать endpoint?"**
→ GUIDE_WHICH_FILE_FOR_WHAT.md → "По задачам" → "Я пишу новый endpoint"

**"Я потерялся"**
→ Прочитай QUICK_START_DEVS.md заново (15 минут)

**"Мне нужен prompt для AI"**
→ PROMPT_FOR_CURSOR_CODEX.md, скопируй весь файл

---

**Версия:** 1.0
**Дата:** 28 ноября 2025
**Статус:** Готов к разработке ✅

