import 'package:flutter_test/flutter_test.dart';
import 'package:alalami_aqarat/navigation_policy.dart';

void main() {
  group('external app link policy', () {
    test('routes supported phone and conferencing links externally', () {
      for (final url in [
        'tel:+966500000000',
        'https://wa.me/966500000000',
        'https://api.whatsapp.com/send',
        'https://zoom.us/j/123',
        'https://us02.zoom.us/j/123',
        'https://meet.google.com/abc-defg-hij',
      ]) {
        expect(shouldOpenExternally(Uri.parse(url)), isTrue, reason: url);
      }
    });

    test('rejects unsafe schemes and lookalike domains', () {
      for (final url in [
        'javascript:alert(1)',
        'http://wa.me/966500000000',
        'https://wa.me.attacker.example/',
        'https://zoom.us.attacker.example/',
        'tel:javascript',
      ]) {
        expect(shouldOpenExternally(Uri.parse(url)), isFalse, reason: url);
      }
    });
  });

  test('first-party permissions are restricted to the HTTPS platform origin', () {
    expect(
      isFirstPartyUri(Uri.parse('https://alalami-aqaratcom.onrender.com/')),
      isTrue,
    );
    expect(
      isFirstPartyUri(Uri.parse('http://alalami-aqaratcom.onrender.com/')),
      isFalse,
    );
    expect(
      isFirstPartyUri(Uri.parse('https://attacker.example/')),
      isFalse,
    );
  });
}
