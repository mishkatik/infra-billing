// Dashboard page strings. Keys live under the `dashboard` namespace.
export const dashboard = {
  en: {
    title: 'Dashboard',
    subtitle: 'Infrastructure expenses overview',
    kpi: {
      monthly: 'Monthly expenses',
      yearly: 'Yearly projection',
      currentMonthPayments: 'Payments this month',
      totalSpent: 'Total spent',
    },
    critical: {
      title: "Critical: won't cover the charge",
      charge: 'charge {{when}} of {{amount}}',
      balance: ' · balance {{amount}}',
    },
    charts: {
      byType: 'Expenses by type ({{base}}/mo)',
      forecast: 'Charge forecast ({{base}})',
      forecastSeries: 'Forecast',
    },
    empty: {
      noServices: 'No active services',
      noData: 'No data',
      noUpcoming: 'No charges in the next 14 days',
    },
    upcoming: {
      title: 'Upcoming charges (14 days)',
      insufficientBalance: ' · insufficient balance',
    },
    due: {
      today: 'today',
      tomorrow: 'tomorrow',
      inDays: 'in {{n}} days',
    },
  },
  ru: {
    title: 'Дашборд',
    subtitle: 'Обзор расходов на инфраструктуру',
    kpi: {
      monthly: 'Расходы в месяц',
      yearly: 'Прогноз в год',
      currentMonthPayments: 'Платежи в этом месяце',
      totalSpent: 'Всего потрачено',
    },
    critical: {
      title: 'Критично: не хватит на списание',
      charge: 'списание {{when}} на {{amount}}',
      balance: ' · баланс {{amount}}',
    },
    charts: {
      byType: 'Расходы по типам ({{base}}/мес)',
      forecast: 'Прогноз списаний ({{base}})',
      forecastSeries: 'Прогноз',
    },
    empty: {
      noServices: 'Нет активных сервисов',
      noData: 'Нет данных',
      noUpcoming: 'Нет списаний в ближайшие 14 дней',
    },
    upcoming: {
      title: 'Ближайшие списания (14 дней)',
      insufficientBalance: ' · не хватает баланса',
    },
    due: {
      today: 'сегодня',
      tomorrow: 'завтра',
      inDays: 'через {{n}} дн.',
    },
  },
};
