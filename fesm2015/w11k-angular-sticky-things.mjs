import * as i0 from '@angular/core';
import { EventEmitter, isDevMode, PLATFORM_ID, Directive, Inject, Input, HostBinding, Output, HostListener, NgModule } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Subject, animationFrameScheduler, combineLatest, pipe } from 'rxjs';
import { throttleTime, share, startWith, filter, map, takeUntil, auditTime } from 'rxjs/operators';

class StickyThingDirective {
    set marginTop(value) {
        this.marginTop$.next(value);
    }
    set marginBottom(value) {
        this.marginBottom$.next(value);
    }
    set enable(value) {
        this.enable$.next(value);
    }
    constructor(stickyElement, platformId) {
        this.stickyElement = stickyElement;
        this.platformId = platformId;
        this.filterGate = false;
        this.marginTop$ = new BehaviorSubject(0);
        this.marginBottom$ = new BehaviorSubject(0);
        this.enable$ = new BehaviorSubject(true);
        this.auditTime = 0;
        this.sticky = false;
        this.isSticky = false;
        this.boundaryReached = false;
        this.upperBoundReached = false;
        this.stickyStatus = new EventEmitter();
        this.stickyPosition = new EventEmitter();
        /**
         * The field represents some position values in normal (not sticky) mode.
         * If the browser size or the content of the page changes, this value must be recalculated.
         * */
        this.scroll$ = new Subject();
        this.target = this.getScrollTarget();
        this.resize$ = new Subject();
        this.extraordinaryChange$ = new BehaviorSubject(undefined);
        this.componentDestroyed = new Subject();
        this.listener = (e) => {
            const upperScreenEdgeAt = e.target.scrollTop || window.pageYOffset;
            this.scroll$.next(upperScreenEdgeAt);
        };
        /**
         * Throttle the scroll to animation frame (around 16.67ms) */
        this.scrollThrottled$ = this.scroll$
            .pipe(throttleTime(0, animationFrameScheduler), share());
        /**
         * Throttle the resize to animation frame (around 16.67ms) */
        this.resizeThrottled$ = this.resize$
            .pipe(throttleTime(0, animationFrameScheduler), 
        // emit once since we are currently using combineLatest
        startWith(null), share());
        this.status$ = combineLatest(this.enable$, this.scrollThrottled$, this.marginTop$, this.marginBottom$, this.extraordinaryChange$, this.resizeThrottled$)
            .pipe(filter(([enabled]) => this.checkEnabled(enabled)), map(([enabled, pageYOffset, marginTop, marginBottom]) => this.determineStatus(this.determineElementOffsets(), pageYOffset, marginTop, marginBottom, enabled)), share());
    }
    ngAfterViewInit() {
        const operators = this.scrollContainer ?
            pipe(takeUntil(this.componentDestroyed)) :
            pipe(auditTime(this.auditTime), takeUntil(this.componentDestroyed));
        this.status$
            .pipe(operators)
            .subscribe((status) => {
            this.setSticky(status);
            this.setStatus(status);
        });
    }
    recalculate() {
        if (isPlatformBrowser(this.platformId)) {
            // Make sure to be in the next tick by using timeout
            setTimeout(() => {
                this.extraordinaryChange$.next(undefined);
            }, 0);
        }
    }
    /**
     * This is nasty code that should be refactored at some point.
     *
     * The Problem is, we filter for enabled. So that the code doesn't run
     * if @Input enabled = false. But if the user disables, we need exactly 1
     * emit in order to reset and call removeSticky. So this method basically
     * turns the filter in "filter, but let the first pass".
     * */
    checkEnabled(enabled) {
        if (!isPlatformBrowser(this.platformId)) {
            return false;
        }
        if (enabled) {
            // reset the gate
            this.filterGate = false;
            return true;
        }
        else {
            if (this.filterGate) {
                // gate closed, first emit has happened
                return false;
            }
            else {
                // this is the first emit for enabled = false,
                // let it pass, and activate the gate
                // so the next wont pass.
                this.filterGate = true;
                return true;
            }
        }
    }
    onWindowResize() {
        if (isPlatformBrowser(this.platformId)) {
            this.resize$.next();
        }
    }
    setupListener() {
        if (isPlatformBrowser(this.platformId)) {
            const target = this.getScrollTarget();
            target.addEventListener('scroll', this.listener);
        }
    }
    ngOnInit() {
        this.checkSetup();
        this.setupListener();
    }
    ngOnDestroy() {
        this.target.removeEventListener('scroll', this.listener);
        this.componentDestroyed.next();
    }
    getScrollTarget() {
        let target;
        if (this.scrollContainer && typeof this.scrollContainer === 'string') {
            target = document.querySelector(this.scrollContainer);
            this.marginTop$.next(Infinity);
            this.auditTime = 0;
        }
        else if (this.scrollContainer && this.scrollContainer instanceof HTMLElement) {
            target = this.scrollContainer;
            this.marginTop$.next(Infinity);
            this.auditTime = 0;
        }
        else {
            target = window;
        }
        return target;
    }
    getComputedStyle(el) {
        return el.getBoundingClientRect();
    }
    determineStatus(originalVals, pageYOffset, marginTop, marginBottom, enabled) {
        const elementPos = this.determineElementOffsets();
        let isSticky = enabled && pageYOffset > originalVals.offsetY;
        if (pageYOffset < elementPos.offsetY) {
            isSticky = false;
        }
        const stickyElementHeight = this.getComputedStyle(this.stickyElement.nativeElement).height;
        const reachedLowerEdge = (this.boundaryElement != null) ? this.boundaryElement && window.pageYOffset + stickyElementHeight + marginBottom >= (originalVals.bottomBoundary - marginTop * 1.0) : undefined;
        const reachedUpperEdge = (this.boundaryElement != null) ? window.pageYOffset < (this.boundaryElement.offsetTop + marginTop * 1.0) : undefined;
        this.stickyPosition.emit(Object.assign(Object.assign({}, elementPos), { upperScreenEdgeAt: pageYOffset, marginBottom, marginTop }));
        return {
            isSticky,
            reachedUpperEdge,
            reachedLowerEdge,
        };
    }
    // not always pixel. e.g. ie9
    getMargins() {
        const stickyStyles = window.getComputedStyle(this.stickyElement.nativeElement);
        const top = parseInt(stickyStyles.marginTop, 10);
        const bottom = parseInt(stickyStyles.marginBottom, 10);
        return { top, bottom };
    }
    /**
     * Gets the offset for element. If the element
     * currently is sticky, it will get removed
     * to access the original position. Other
     * wise this would just be 0 for fixed elements. */
    determineElementOffsets() {
        if (this.sticky) {
            this.removeSticky();
        }
        let bottomBoundary = null;
        if (this.boundaryElement) {
            const boundaryElementHeight = this.getComputedStyle(this.boundaryElement).height;
            const boundaryElementOffset = getPosition(this.boundaryElement).y;
            bottomBoundary = boundaryElementHeight + boundaryElementOffset;
        }
        return {
            offsetY: (getPosition(this.stickyElement.nativeElement).y - this.marginTop$.value), bottomBoundary
        };
    }
    makeSticky(boundaryReached = false, marginTop, marginBottom) {
        // do this before setting it to pos:fixed
        const { width, height, left } = this.getComputedStyle(this.stickyElement.nativeElement);
        const offSet = boundaryReached ? (this.getComputedStyle(this.boundaryElement).bottom - height - this.marginBottom$.value) : this.marginTop$.value;
        if (this.scrollContainer && !this.sticky) {
            this.stickyElement.nativeElement.style.position = 'sticky';
            this.stickyElement.nativeElement.style.top = '0px';
            this.sticky = true;
        }
        else {
            this.stickyElement.nativeElement.style.position = 'fixed';
            this.stickyElement.nativeElement.style.top = offSet + 'px';
            this.stickyElement.nativeElement.style.left = left + 'px';
            this.stickyElement.nativeElement.style.width = `${width}px`;
        }
        if (this.spacerElement) {
            const spacerHeight = marginBottom + height + marginTop;
            this.spacerElement.style.height = `${spacerHeight}px`;
        }
    }
    determineBoundaryReached(boundaryHeight, stickyElHeight, cssMargins, marginTop, marginBottom, upperScreenEdgeAt) {
        const boundaryElementPos = getPosition(this.boundaryElement);
        const boundaryElementLowerEdge = boundaryElementPos.y + boundaryHeight;
        const lowerEdgeStickyElement = upperScreenEdgeAt + stickyElHeight + marginTop + cssMargins.top + marginBottom + cssMargins.bottom;
        return boundaryElementLowerEdge <= lowerEdgeStickyElement;
    }
    checkSetup() {
        if (isDevMode() && !this.spacerElement) {
            console.warn(`******There might be an issue with your sticky directive!******

You haven't specified a spacer element. This will cause the page to jump.

Best practise is to provide a spacer element (e.g. a div) right before/after the sticky element.
Then pass the spacer element as input:

<div #spacer></div>

<div stickyThing="" [spacer]="spacer">
    I am sticky!
</div>`);
        }
    }
    setSticky(status) {
        if (status.isSticky) {
            if (this.upperBoundReached) {
                this.removeSticky();
                this.isSticky = false;
            }
            else {
                this.makeSticky(status.reachedLowerEdge, status.marginTop, status.marginBottom);
                this.isSticky = true;
            }
        }
        else {
            this.removeSticky();
        }
    }
    setStatus(status) {
        this.upperBoundReached = status.reachedUpperEdge;
        this.boundaryReached = status.reachedLowerEdge;
        this.stickyStatus.next(status);
    }
    removeSticky() {
        this.boundaryReached = false;
        this.sticky = false;
        this.stickyElement.nativeElement.style.position = '';
        this.stickyElement.nativeElement.style.width = 'auto';
        this.stickyElement.nativeElement.style.left = 'auto';
        this.stickyElement.nativeElement.style.top = 'auto';
        if (this.spacerElement) {
            this.spacerElement.style.height = '0';
        }
    }
}
StickyThingDirective.ɵfac = function StickyThingDirective_Factory(t) { return new (t || StickyThingDirective)(i0.ɵɵdirectiveInject(i0.ElementRef), i0.ɵɵdirectiveInject(PLATFORM_ID)); };
StickyThingDirective.ɵdir = /*@__PURE__*/ i0.ɵɵdefineDirective({ type: StickyThingDirective, selectors: [["", "stickyThing", ""]], hostVars: 6, hostBindings: function StickyThingDirective_HostBindings(rf, ctx) {
        if (rf & 1) {
            i0.ɵɵlistener("resize", function StickyThingDirective_resize_HostBindingHandler() { return ctx.onWindowResize(); }, false, i0.ɵɵresolveWindow);
        }
        if (rf & 2) {
            i0.ɵɵclassProp("is-sticky", ctx.isSticky)("boundary-reached", ctx.boundaryReached)("upper-bound-reached", ctx.upperBoundReached);
        }
    }, inputs: { scrollContainer: "scrollContainer", auditTime: "auditTime", marginTop: "marginTop", marginBottom: "marginBottom", enable: "enable", spacerElement: ["spacer", "spacerElement"], boundaryElement: ["boundary", "boundaryElement"] }, outputs: { stickyStatus: "stickyStatus", stickyPosition: "stickyPosition" } });
(function () {
    (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(StickyThingDirective, [{
            type: Directive,
            args: [{
                    selector: '[stickyThing]'
                }]
        }], function () {
        return [{ type: i0.ElementRef }, { type: undefined, decorators: [{
                        type: Inject,
                        args: [PLATFORM_ID]
                    }] }];
    }, { scrollContainer: [{
                type: Input
            }], auditTime: [{
                type: Input
            }], marginTop: [{
                type: Input
            }], marginBottom: [{
                type: Input
            }], enable: [{
                type: Input
            }], spacerElement: [{
                type: Input,
                args: ['spacer']
            }], boundaryElement: [{
                type: Input,
                args: ['boundary']
            }], isSticky: [{
                type: HostBinding,
                args: ['class.is-sticky']
            }], boundaryReached: [{
                type: HostBinding,
                args: ['class.boundary-reached']
            }], upperBoundReached: [{
                type: HostBinding,
                args: ['class.upper-bound-reached']
            }], stickyStatus: [{
                type: Output
            }], stickyPosition: [{
                type: Output
            }], onWindowResize: [{
                type: HostListener,
                args: ['window:resize', []]
            }] });
})();
// Thanks to https://stanko.github.io/javascript-get-element-offset/
function getPosition(el) {
    let top = 0;
    let left = 0;
    let element = el;
    // Loop through the DOM tree
    // and add it's parent's offset to get page offset
    do {
        top += element.offsetTop || 0;
        left += element.offsetLeft || 0;
        element = element.offsetParent;
    } while (element);
    return {
        y: top,
        x: left,
    };
}

class AngularStickyThingsModule {
}
AngularStickyThingsModule.ɵfac = function AngularStickyThingsModule_Factory(t) { return new (t || AngularStickyThingsModule)(); };
AngularStickyThingsModule.ɵmod = /*@__PURE__*/ i0.ɵɵdefineNgModule({ type: AngularStickyThingsModule });
AngularStickyThingsModule.ɵinj = /*@__PURE__*/ i0.ɵɵdefineInjector({});
(function () {
    (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(AngularStickyThingsModule, [{
            type: NgModule,
            args: [{
                    imports: [],
                    declarations: [
                        StickyThingDirective,
                    ],
                    exports: [
                        StickyThingDirective,
                    ]
                }]
        }], null, null);
})();
(function () { (typeof ngJitMode === "undefined" || ngJitMode) && i0.ɵɵsetNgModuleScope(AngularStickyThingsModule, { declarations: [StickyThingDirective], exports: [StickyThingDirective] }); })();

/*
 * Public API Surface of angular-sticky-things
 */

/**
 * Generated bundle index. Do not edit.
 */

export { AngularStickyThingsModule, StickyThingDirective };
//# sourceMappingURL=w11k-angular-sticky-things.mjs.map
