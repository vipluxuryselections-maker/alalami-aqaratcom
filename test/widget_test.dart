import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:alalami_aqarat/app_shell.dart';
import 'package:alalami_aqarat/services/api_client.dart';

void main() {
  ApiClient createApi() => ApiClient(
        client: MockClient((_) async {
          return http.Response(
            jsonEncode({
              'success': true,
              'items': <Object>[],
              'members': <Object>[],
              'partners': <Object>[],
            }),
            200,
            headers: const {'content-type': 'application/json'},
          );
        }),
      );

  Future<void> pumpApp(WidgetTester tester, ApiClient api) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: BourseAppShell(
            isDarkMode: true,
            onToggleTheme: () {},
            api: api,
          ),
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets('marketplace and draggable assistant render in RTL', (
    WidgetTester tester,
  ) async {
    final api = createApi();
    addTearDown(api.close);

    await pumpApp(tester, api);

    expect(find.text('السوق المتكاملة'), findsOneWidget);
    expect(find.text('اسأل المساعد'), findsOneWidget);
    expect(find.text('المكتب'), findsOneWidget);
    expect(find.text('إضافة'), findsOneWidget);
  });

  testWidgets('office tab shows profile and ledger navigation', (
    WidgetTester tester,
  ) async {
    final api = createApi();
    addTearDown(api.close);

    await pumpApp(tester, api);
    await tester.tap(find.text('المكتب'));
    await tester.pump();

    expect(find.text('المستخدم والمكتب'), findsOneWidget);
    expect(find.text('تسجيل منشأة'), findsOneWidget);
    expect(find.text('طلباتي'), findsOneWidget);
  });

  testWidgets('assistant can be hidden and restored', (
    WidgetTester tester,
  ) async {
    final api = createApi();
    addTearDown(api.close);

    await pumpApp(tester, api);
    await tester.tap(find.byTooltip('إخفاء المساعد'));
    await tester.pump();
    expect(find.byTooltip('إظهار المساعد'), findsOneWidget);

    await tester.tap(find.byTooltip('إظهار المساعد'));
    await tester.pump();
    expect(find.text('اسأل المساعد'), findsOneWidget);
  });
}
