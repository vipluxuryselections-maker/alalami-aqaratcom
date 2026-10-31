import 'package:flutter_test/flutter_test.dart';

import 'package:aqarat_app/main.dart';

void main() {
  testWidgets('Aqarat home screen renders', (WidgetTester tester) async {
    await tester.pumpWidget(const AlAlamiAqaratApp());

    expect(find.text('العالمي للعقارات الذكية 🏠'), findsOneWidget);
    expect(find.text('دخول قسم المزادات الفورية'), findsOneWidget);
  });

  testWidgets('Developer dashboard opens and labels sample information', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const AlAlamiAqaratApp());

    await tester.tap(find.byTooltip('لوحة المطور'));
    await tester.pumpAndSettle();

    expect(find.text('غرفة التحكم العليا للمطور 👑'), findsOneWidget);
    expect(find.text('184,500 ريال'), findsOneWidget);
    expect(
      find.text('تنبيه تجريبي: رصد عبارة غير مسموح بها في محادثة'),
      findsOneWidget,
    );
    expect(
      find.textContaining('لا توجد مراقبة مباشرة متصلة بهذه الشاشة.'),
      findsOneWidget,
    );
  });
}
