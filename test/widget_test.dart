import 'package:flutter_test/flutter_test.dart';

import 'package:aqarat_app/main.dart';

void main() {
  testWidgets('Aqarat home screen renders', (WidgetTester tester) async {
    await tester.pumpWidget(const AlAlamiAqaratApp());

    expect(find.text('العالمي للعقارات الذكية 🏠'), findsOneWidget);
    expect(find.text('دخول قسم المزادات الفورية'), findsOneWidget);
  });

  testWidgets('Investment portal shows a draft that can be cancelled', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const AlAlamiAqaratApp());

    await tester.tap(find.text('دخول قسم المزادات الفورية'));
    await tester.pumpAndSettle();

    expect(find.text('📜 مسودة معلوماتية: المزاد العقاري'), findsOneWidget);
    expect(find.text('قرأت المسودة وأتابع'), findsOneWidget);
    expect(
      find.textContaining('لا ينشئ العرض عقداً'),
      findsOneWidget,
    );

    await tester.tap(find.text('إلغاء'));
    await tester.pumpAndSettle();

    expect(find.text('📜 مسودة معلوماتية: المزاد العقاري'), findsNothing);
    expect(
      find.textContaining('لم يتم توقيع عقد أو دفع مبلغ'),
      findsNothing,
    );
  });

  testWidgets('Acknowledging a draft does not claim a signature or payment', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const AlAlamiAqaratApp());

    await tester.tap(find.text('دخول قسم المزادات الفورية'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('قرأت المسودة وأتابع'));
    await tester.pumpAndSettle();

    expect(
      find.text(
        'تم اختيار متابعة العرض فقط. لم يتم توقيع عقد أو دفع مبلغ أو قفل صفقة.',
      ),
      findsOneWidget,
    );
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
